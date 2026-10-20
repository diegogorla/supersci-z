export type GtagCommand = (...args: unknown[]) => void;
export function googleCommandQueue(push: (command: IArguments) => void): GtagCommand {
  // Google's command queue uses an Arguments object, not a data-layer array.
  // https://developers.google.com/tag-platform/gtagjs
  return function () {
    // eslint-disable-next-line prefer-rest-params -- preserve the documented gtag command format
    push(arguments);
  };
}
