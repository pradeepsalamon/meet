import type { JitsiMeetJSStatic } from "@/lib/jitsi/types";

const SCRIPT_ID = "blueroom-lib-jitsi-meet";

let activeScriptSrc: string | null = null;
let loadPromise: Promise<JitsiMeetJSStatic> | null = null;

function getScriptSrc(domain: string) {
  return `https://${domain}/libs/lib-jitsi-meet.min.js`;
}

export function loadJitsiMeetJS(domain: string) {
  const scriptSrc = getScriptSrc(domain);

  if (typeof window === "undefined") {
    return Promise.reject(new Error("Jitsi can only be loaded in the browser."));
  }

  if (window.JitsiMeetJS && activeScriptSrc === scriptSrc) {
    return Promise.resolve(window.JitsiMeetJS);
  }

  if (loadPromise && activeScriptSrc === scriptSrc) {
    return loadPromise;
  }

  const existingScript = document.getElementById(SCRIPT_ID);

  if (existingScript && existingScript.getAttribute("src") !== scriptSrc) {
    existingScript.remove();
    window.JitsiMeetJS = undefined;
  }

  activeScriptSrc = scriptSrc;
  loadPromise = new Promise<JitsiMeetJSStatic>((resolve, reject) => {
    const currentScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    if (currentScript && window.JitsiMeetJS) {
      resolve(window.JitsiMeetJS);
      return;
    }

    const script = currentScript ?? document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = scriptSrc;
    script.async = true;

    script.addEventListener(
      "load",
      () => {
        if (!window.JitsiMeetJS) {
          reject(new Error("The Jitsi library loaded, but JitsiMeetJS is missing."));
          return;
        }

        resolve(window.JitsiMeetJS);
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        loadPromise = null;
        reject(new Error(`Could not load lib-jitsi-meet from ${scriptSrc}.`));
      },
      { once: true },
    );

    if (!currentScript) {
      document.head.appendChild(script);
    }
  });

  return loadPromise;
}
