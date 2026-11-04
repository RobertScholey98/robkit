// What the pre-commit hook runs on the files a commit stages. robkit check
// reads the whole install, so it runs once and takes no file names.
export default {
  "*.{js,jsx,mjs,cjs,ts,tsx}": () => "robkit check",
};
