// L'application BTS CIEL : ordinateur (Mac, Windows, Linux) et téléphone
// (Android, iPhone).
//
// Elle ne réécrit rien : la fenêtre affiche les pages du site, embarquées
// dans l'application au moment de la compilation (dossier ../site, recopié
// du site publié par construire.sh, ou par la GitHub Action). Tout marche
// donc hors ligne, comme le site.
//
// Une seule règle en plus : un lien vers un AUTRE site s'ouvre dans le
// navigateur de l'appareil. Sans elle, l'application partirait sur une
// page extérieure, sans bouton pour revenir.
//
// Le code vit dans cette bibliothèque, et non dans main.rs : sur un
// téléphone, il n'y a pas de « main », c'est le système qui appelle
// run() (d'où « mobile_entry_point »). main.rs ne fait que l'appeler.

use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let poignee = app.handle().clone();
            let fenetre =
                WebviewWindowBuilder::new(app, "principale", WebviewUrl::App("index.html".into()))
                    .on_navigation(move |url| {
                        // tauri://localhost sur Mac, Linux et iPhone ;
                        // http://tauri.localhost sur Windows et Android
                        let interne = url.scheme() == "tauri"
                            || url.host_str() == Some("tauri.localhost")
                            || matches!(url.scheme(), "about" | "data" | "blob");
                        if !interne {
                            let _ = poignee.opener().open_url(url.as_str(), None::<&str>);
                        }
                        interne
                    });
            // un titre et une taille n'ont de sens que sur un ordinateur :
            // sur un téléphone, l'application occupe l'écran
            #[cfg(desktop)]
            let fenetre = fenetre
                .title("BTS CIEL")
                .inner_size(1280.0, 860.0)
                .min_inner_size(360.0, 560.0);
            fenetre.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("l'application BTS CIEL n'a pas pu démarrer");
}
