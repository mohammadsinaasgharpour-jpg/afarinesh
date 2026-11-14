// Measurement guides for checking horizontal alignment. Off for visitors: they appear only with ?guides
// in the address (e.g. /?guides=1); the G key then hides and shows them. Nothing here affects layout.
//   red line   = the page's centre        blue lines = the content column (.wrap) edges
//   top ruler  = pixels from the left edge, a tick every 10 px and a number every 100 px
//   readout    = viewport, column width, both gutters and how far the column is from centre
export function initGuides() {
  const layer = document.createElement("div");
  layer.className = "guides";
  layer.setAttribute("aria-hidden", "true");
  const ruler = Object.assign(document.createElement("div"), { className: "guides-ruler" });
  const centre = Object.assign(document.createElement("div"), { className: "guides-line guides-centre" });
  const left = Object.assign(document.createElement("div"), { className: "guides-line guides-edge" });
  const right = Object.assign(document.createElement("div"), { className: "guides-line guides-edge" });
  const readout = Object.assign(document.createElement("output"), { className: "guides-readout" });
  layer.append(ruler, centre, left, right, readout);
  document.body.append(layer);

  const draw = () => {
    const vw = document.documentElement.clientWidth;
    // the first content column that has a box (on phones the hero's column is display: contents)
    const box = [...document.querySelectorAll("main .wrap, .wrap")].map((w) => w.getBoundingClientRect()).find((b) => b.width > 0);
    ruler.replaceChildren(...Array.from({ length: Math.floor(vw / 100) + 1 }, (_, i) => {
      const n = Object.assign(document.createElement("span"), { textContent: String(i * 100) });
      n.style.left = `${i * 100}px`;
      return n;
    }));
    centre.style.left = `${vw / 2}px`;
    if (box) {
      left.style.left = `${box.left}px`;
      right.style.left = `${box.right}px`;
      const gl = Math.round(box.left), gr = Math.round(vw - box.right);
      readout.value = `viewport ${vw}px · column ${Math.round(box.width)}px · gutters ${gl} / ${gr}px · off-centre ${gl - gr}px`;
    } else readout.value = `viewport ${vw}px · no content column`;
  };
  draw();
  addEventListener("resize", draw);
  addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "g" || e.target.closest?.("input, textarea, select")) return;
    layer.hidden = !layer.hidden;
  });
}
