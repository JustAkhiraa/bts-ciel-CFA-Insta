// L'application de bureau du site BTS CIEL.
//
// Elle ne réécrit rien : la fenêtre affiche les pages du site, embarquées
// dans l'application au moment de la compilation (dossier ../site, recopié
// du site publié par construire.sh, ou par la GitHub Action pour Windows et
// Linux). Tout marche donc hors ligne, comme le site.
//
// Une seule règle en plus : un lien vers un AUTRE site s'ouvre dans le
// navigateur de l'ordinateur. Sans elle, l'application partirait sur une
// page extérieure, sans bouton pour revenir.

// Sur Windows, pas de fenêtre de console à côté de l'application.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let poignee = app.handle().clone();
            WebviewWindowBuilder::new(app, "principale", WebviewUrl::App("index.html".into()))
                .title("BTS CIEL")
                .inner_size(1280.0, 860.0)
                .min_inner_size(360.0, 560.0)
                .on_navigation(move |url| {
                    // tauri://localhost sur Mac et Linux, http://tauri.localhost sur Windows
                    let interne = url.scheme() == "tauri"
                        || url.host_str() == Some("tauri.localhost")
                        || matches!(url.scheme(), "about" | "data" | "blob");
                    if !interne {
                        let _ = poignee.opener().open_url(url.as_str(), None::<&str>);
                    }
                    interne
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("l'application BTS CIEL n'a pas pu démarrer");
}
