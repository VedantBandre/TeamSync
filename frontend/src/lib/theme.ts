export function initializeTheme() {
  let theme = "light";
  try {
    theme =
      localStorage.getItem("teamsync.theme") === "dark" ? "dark" : "light";
  } catch {
    /* Storage can be unavailable. */
  }
  document.documentElement.dataset.theme = theme;
}
