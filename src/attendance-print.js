import letterhead from "./assets/ipm-letterhead-clean.png";
import { renderAttendanceReport } from "./attendance.js";
export async function printAttendance(list, people, options = {}) {
  const frame = document.createElement("iframe");
  frame.title = "Impressão da lista de presença";
  Object.assign(frame.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    left: "-10000px",
    border: "0",
  });
  try {
    // Inline artwork keeps exported HTML/PDF independent of an app session.
    const response = await fetch(letterhead);
    if (!response.ok)
      throw new Error("Não foi possível carregar o timbre. Tente novamente.");
    const header = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      response.blob().then((blob) => reader.readAsDataURL(blob), reject);
    });
    // Only the header portion; the template's footer is not part of the table.
    const cropped = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 2172;
        canvas.height = 302;
        canvas
          .getContext("2d")
          .drawImage(image, 0, 128, 2172, 302, 0, 0, 2172, 302);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = reject;
      image.src = header;
    });
    const loaded = new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
    });
    frame.srcdoc = renderAttendanceReport(list, people, {
      ...options,
      header: cropped,
    });
    document.body.append(frame);
    await loaded;
    await frame.contentDocument.fonts.ready;
    await Promise.all(
      [...frame.contentDocument.images].map((img) => img.decode()),
    );
    frame.contentWindow.addEventListener("afterprint", () => frame.remove(), {
      once: true,
    });
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 120000);
  } catch (error) {
    frame.remove();
    throw error;
  }
}
