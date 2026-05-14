/* page-library.jsx — back-compat alias.
   The Library page was upgraded into the Vault. Both nav routes ("library"
   and "vault") render the same PageVault component now. This file just
   re-exports PageVault as PageLibrary so app.jsx's `case "library"` keeps
   resolving without needing a coordinated rename. */
(function () {
  function PageLibraryAlias(props) {
    const V = window.PageVault;
    if (V) return React.createElement(V, props);
    return React.createElement(
      "div",
      { className: "page-pad", style: { padding: 40, color: "var(--text-tertiary)", fontSize: 13 } },
      "Vault loading…"
    );
  }
  window.PageLibrary = PageLibraryAlias;
})();
