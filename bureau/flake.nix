# L'application BTS CIEL pour NixOS (et pour Nix sur n'importe quel Linux).
#
#   nix run "github:JustAkhiraa/bts-ciel-CFA-Insta?dir=bureau"
#
# Ou, dans la configuration de NixOS : ajouter ce dépôt aux « inputs » et
# « inputs.bts-ciel.packages.${pkgs.system}.default » aux paquets.
#
# Nix ne reprend pas un paquet tout fait : il recompile l'application à
# partir de ces sources (bureau/src-tauri) et du site publié, à la racine du
# dépôt, qu'il recopie dans bureau/site avant de compiler.
{
  description = "BTS CIEL : les fiches de révision, en application de bureau";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systemes = [ "x86_64-linux" "aarch64-linux" ];
      pour = f: nixpkgs.lib.genAttrs systemes (s: f nixpkgs.legacyPackages.${s});
      conf = builtins.fromJSON (builtins.readFile ./src-tauri/tauri.conf.json);
    in
    {
      packages = pour (pkgs: {
        default = pkgs.rustPlatform.buildRustPackage {
          pname = "bts-ciel";
          version = conf.version;
          # la racine du dépôt : le site publié, et ce dossier
          src = ./..;
          cargoRoot = "bureau/src-tauri";
          buildAndTestSubdir = "bureau/src-tauri";
          cargoLock.lockFile = ./src-tauri/Cargo.lock;

          nativeBuildInputs = with pkgs; [ cargo-tauri.hook pkg-config wrapGAppsHook3 ];
          buildInputs = with pkgs; [ glib-networking openssl webkitgtk_4_1 ];

          # le site à embarquer : tout, sauf l'application elle-même et
          # l'outillage du dépôt
          preBuild = ''
            mkdir -p bureau/site
            for f in *; do
              case "$f" in
                bureau|verification|outillage) ;;
                *) cp -r "$f" bureau/site/ ;;
              esac
            done
            test -f bureau/site/index.html
          '';

          meta = {
            description = "Les fiches de révision du BTS CIEL, en application de bureau";
            homepage = "https://github.com/JustAkhiraa/bts-ciel-CFA-Insta";
            mainProgram = "bts-ciel";
            platforms = pkgs.lib.platforms.linux;
          };
        };
      });

      apps = pour (pkgs: {
        default = {
          type = "app";
          program = "${self.packages.${pkgs.stdenv.hostPlatform.system}.default}/bin/bts-ciel";
        };
      });
    };
}
