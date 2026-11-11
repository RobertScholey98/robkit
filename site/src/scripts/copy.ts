// Each code block's copy button. It copies the block's text as written,
// without the prompts a command block shows, then says so on the button
// and to a screen reader. When the browser refuses, it says that instead,
// and the code is still there to select.

const shown = 2000;

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-copy]",
)) {
  const frame = button.closest("figure");
  const code = frame?.querySelector("pre");
  const label = button.querySelector("[data-copy-label]");
  const status = frame?.querySelector("[data-copy-status]");
  if (!code || !label || !status) continue;
  let timer: number | undefined;

  const say = (text: string, announce: string, copied: boolean) => {
    label.textContent = text;
    status.textContent = announce;
    button.toggleAttribute("data-copied", copied);
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      label.textContent = "Copy";
      status.textContent = "";
      button.removeAttribute("data-copied");
    }, shown);
  };

  button.hidden = false;
  button.addEventListener("click", () => {
    navigator.clipboard.writeText(code.textContent).then(
      () => {
        say("Copied", "Copied", true);
      },
      () => {
        say(
          "Couldn't copy",
          "Your browser didn't allow copying. Select the code to copy it.",
          false,
        );
      },
    );
  });
}
