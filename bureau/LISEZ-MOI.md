# L'application de bureau

Le site, dans une application pour Mac, Windows et Linux, qui marche hors ligne.

**La télécharger** : https://github.com/JustAkhiraa/bts-ciel-CFA-Insta/releases/latest

Linux : .deb (Debian, Ubuntu, Mint, Kali), .rpm (Fedora, openSUSE), .pkg.tar.zst
(Arch, Manjaro), .flatpak (toute distribution), .AppImage (sans installation).
NixOS : `nix run "github:JustAkhiraa/bts-ciel-CFA-Insta?dir=bureau"`.

Ce dossier ne contient que l'enveloppe : la fenêtre, les icônes, la configuration.
Les pages viennent du site publié, recopiées dans `bureau/site` au moment de la
fabrication par l'Action « Appli de bureau » (`.github/workflows/bureau.yml`).
