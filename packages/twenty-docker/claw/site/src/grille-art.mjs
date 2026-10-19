// Drawn stand-ins for design and work photos until real ones are uploaded.
const frame = (body) =>
  `<svg class="grille-art" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
  `<rect width="120" height="120" fill="#232323"/>` +
  `<g fill="none" stroke="#9a9590" stroke-width="2.2" stroke-linecap="round">${body}</g></svg>`;

const range = (count, map) => Array.from({ length: count }, (_, index) => map(index)).join('');

const bars = (from, to, step, top, bottom) =>
  range(Math.floor((to - from) / step) + 1, (index) => {
    const x = from + index * step;

    return `<path d="M${x} ${top}V${bottom}"/>`;
  });

export const GRILLE_ART = [
  frame(
    `<path d="M20 108V48a40 40 0 0 1 80 0v60H20Z"/>${bars(36, 84, 16, 14, 108)}` +
      `<path d="M60 58l7 10-7 10-7-10Z" fill="#e8600f" stroke="#e8600f"/>`,
  ),
  frame(
    `<rect x="14" y="14" width="92" height="92"/>${bars(30, 90, 15, 14, 106)}` +
      `<path d="M14 60h92"/>` +
      range(4, (index) => {
        const x = 37.5 + index * 15;

        return `<path d="M${x} 52l5 8-5 8-5-8Z" fill="#e8600f" stroke="#e8600f"/>`;
      }),
  ),
  frame(
    `<rect x="14" y="14" width="92" height="92"/>` +
      range(4, (row) =>
        range(4, (column) => {
          const x = 14 + column * 23 + 11.5;
          const y = 14 + row * 23 + 11.5;

          return `<circle cx="${x}" cy="${y}" r="8"/>`;
        }),
      ) +
      `<path d="M37 14v92M60 14v92M83 14v92M14 37h92M14 60h92M14 83h92"/>`,
  ),
  frame(
    `<rect x="14" y="14" width="92" height="92"/>` +
      range(5, (index) => {
        const x = 14 + index * 18.4;

        return `<path d="M${x} 106V44q9.2-22 18.4-30"/><path d="M${x + 18.4} 106V44q-9.2-22-18.4-30"/>`;
      }) +
      `<path d="M14 84h92"/>`,
  ),
];
