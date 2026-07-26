import "@testing-library/jest-dom/vitest";

// jsdom does not implement matchMedia.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom's Blob implementation does not currently expose arrayBuffer(), while
// browsers do. Use FileReader so hashing and media-inspection tests exercise
// the same byte-oriented code paths used in production.
if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    configurable: true,
    value(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) {
            resolve(reader.result);
          } else {
            reject(new TypeError("FileReader did not return an ArrayBuffer."));
          }
        };
        reader.onerror = () => reject(reader.error ?? new Error("Could not read Blob."));
        reader.readAsArrayBuffer(this);
      });
    },
  });
}
