import { getConsoleFunction, setConsoleFunction } from "three";

let installed = false;

/**
 * R3F 9.8 still constructs `THREE.Clock` internally. three r183+ marks that
 * class deprecated and logs a warning on every Canvas mount. Until R3F moves
 * to `THREE.Timer`, filter only that exact advisory so real three.js warnings
 * and errors still reach the console.
 */
export function installThreeConsoleGuard() {
  if (installed) return;
  installed = true;

  const previous = getConsoleFunction();
  setConsoleFunction((type, message, ...args) => {
    if (
      type === "warn" &&
      message.startsWith("THREE.Clock: This module has been deprecated")
    ) {
      return;
    }

    if (previous) {
      previous(type, message, ...args);
      return;
    }

    if (type === "log") {
      console.log(message, ...args);
    } else if (type === "warn") {
      console.warn(message, ...args);
    } else {
      console.error(message, ...args);
    }
  });
}
