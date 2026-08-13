// Participant photos without paid storage.
//
// Firebase Storage requires a billing account, so photos are resized in the
// browser and stored as a base64 data URL directly on the participant
// document. A 240px JPEG at quality 0.72 lands around 15-30 KB, so 600
// participants is roughly 18 MB against Firestore's 1 GB free allowance -
// and well inside the 1 MB-per-document ceiling.
//
// Drive links still work for anyone who already has them.

export const MAX_PHOTO_PX = 240;
export const PHOTO_QUALITY = 0.72;

/**
 * Read an image File, downscale it to fit MAX_PHOTO_PX, and return a JPEG
 * data URL. Rejects anything that is not a decodable image.
 */
/**
 * Resize in the browser and return a data URL.
 *
 * `keepAlpha` produces a PNG with transparency preserved, for logos and
 * house crests. Photographs stay JPEG: a 240px portrait as PNG is several
 * times larger for no visible gain, and the 1 MiB per-document limit is
 * what keeps base64 storage viable at all.
 */
export function compressImage(file, maxPx = MAX_PHOTO_PX, quality = PHOTO_QUALITY, keepAlpha = false) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("That file is not an image."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That image could not be opened."));
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!keepAlpha) {
          ctx.fillStyle = "#fff";             // flatten transparency for JPEG
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(keepAlpha
          ? canvas.toDataURL("image/png")
          : canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Rough byte size of a data URL, for warning before a write. */
export function dataUrlBytes(dataUrl) {
  const b64 = String(dataUrl || "").split(",")[1] || "";
  return Math.round(b64.length * 0.75);
}

const DRIVE_ID = [
  /\/file\/d\/([A-Za-z0-9_-]{10,})/,
  /[?&]id=([A-Za-z0-9_-]{10,})/,
  /\/d\/([A-Za-z0-9_-]{10,})/
];

export function resolvePhotoLink(raw) {
  const link = String(raw || "").trim();
  if (!link) return { photoURL: null, photoSource: null, photoOriginalLink: null, photoLinkUnverified: false };

  if (/drive\.google\.com|docs\.google\.com/.test(link)) {
    for (const re of DRIVE_ID) {
      const m = link.match(re);
      if (m) {
        return {
          photoURL: "https://lh3.googleusercontent.com/d/" + m[1],
          photoSource: "externalLink",
          photoOriginalLink: link,
          photoLinkUnverified: false
        };
      }
    }
  }

  const unverified = /photos\.google\.com|photos\.app\.goo\.gl/.test(link) || !/^https?:\/\//.test(link);
  return {
    photoURL: link,
    photoSource: "externalLink",
    photoOriginalLink: link,
    photoLinkUnverified: true,
    warning: unverified
      ? "Google Photos links usually stop working. Uploading the photo directly is more reliable."
      : "This link type could not be verified. It may not display."
  };
}

/**
 * Neutral silhouette shown wherever a participant has no photo. Inline SVG
 * so it needs no network request and never 404s.
 */
export const PLACEHOLDER_AVATAR =
  "data:image/svg+xml;utf8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">' +
    '<rect width="80" height="80" fill="#E7ECE5"/>' +
    '<circle cx="40" cy="31" r="14" fill="#B4C3BB"/>' +
    '<path d="M12 76c0-15.5 12.5-25 28-25s28 9.5 28 25z" fill="#B4C3BB"/></svg>');

/** The best available image source for a participant, never empty. */
export function photoSrc(p) {
  return p?.photoData || p?.photoURL || PLACEHOLDER_AVATAR;
}

/** Standard avatar element used across the app. */
export function avatar(p, size = 44) {
  const img = document.createElement("img");
  img.src = photoSrc(p);
  img.alt = "";
  img.loading = "lazy";
  img.style.cssText =
    "width:" + size + "px;height:" + size + "px;border-radius:50%;object-fit:cover;" +
    "border:2px solid var(--surface);box-shadow:0 0 0 1px var(--line);background:#E7ECE5;flex:0 0 auto";
  img.addEventListener("error", function () { img.src = PLACEHOLDER_AVATAR; });
  return img;
}

export const PHOTO_HELP =
  'Upload a photo, or paste a Google Drive link shared with "Anyone with the link". Uploads are resized automatically.';
