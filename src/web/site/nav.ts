// Progressive enhancement for the static pages: close the mobile menu after a
// link is chosen, on outside tap, or on Escape. The menu works without this.
const menu = document.querySelector<HTMLDetailsElement>("details.mobile-nav");
if (menu) {
  menu.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("a")) menu.open = false;
  });
  document.addEventListener("click", (event) => {
    if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      menu.querySelector("summary")?.focus();
    }
  });
}
