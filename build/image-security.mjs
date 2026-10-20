// Temporary mitigation for GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq.
// Metadata only uses trusted PNG/JPEG/GIF/WebP files in this project.
// Keep the vulnerable parsers disabled until an upstream fixed version is verified.
import { disableTypes } from "image-size";
export const disabledMetadataImageTypes = ["icns", "heif", "jxl", "jxl-stream"];
disableTypes(disabledMetadataImageTypes);
