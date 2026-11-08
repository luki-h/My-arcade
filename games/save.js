// Tamper-resistant saves for every game in My Arcade.
// Each save is stored next to a checksum made from its contents. If someone edits the save
// by hand (for example with localStorage.setItem in the console), the checksum no longer
// matches and the save is ignored. This only makes cheating harder, not impossible: the code
// runs in the player's own browser, so a determined cheater can still read it and get around it.
(() => {
  const SALT = "tasty-hamburger|my-arcade|v1";
  const SAVE_KEYS = ["myArcadeBest", "myArcadeRacerSave", "myArcadeFishing"];
  const SIGNED_MARK = "myArcadeSigned";

  // cyrb53: a small, fast string hash (not cryptographic, just hard to fake by hand)
  function checksum(text) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  // The key is part of the checksum, so a save can't be copied over a different one
  const sign = (key, data) => checksum(SALT + key + data);

  function save(key, value) {
    const data = JSON.stringify(value);
    try { localStorage.setItem(key, JSON.stringify({ data, sum: sign(key, data) })); } catch (e) {}
  }

  // Returns the saved value, or null if there is none or it was edited by hand
  function load(key) {
    try {
      const box = JSON.parse(localStorage.getItem(key));
      if (box && typeof box.data === "string" && box.sum === sign(key, box.data)) return JSON.parse(box.data);
    } catch (e) {}
    return null;
  }

  // Older versions saved plain, unchecked data. Sign those once so nobody loses their progress.
  try {
    if (!localStorage.getItem(SIGNED_MARK)) {
      for (const key of SAVE_KEYS) {
        try {
          const old = JSON.parse(localStorage.getItem(key));
          if (old && typeof old === "object" && !("sum" in old)) save(key, old);
        } catch (e) {}
      }
      localStorage.setItem(SIGNED_MARK, "1");
    }
  } catch (e) {}

  // Can't be replaced or changed from the console
  Object.defineProperty(window, "ArcadeSave", { value: Object.freeze({ load, save }) });
})();
