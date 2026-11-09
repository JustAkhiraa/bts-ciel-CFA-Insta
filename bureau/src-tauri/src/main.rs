// L'application BTS CIEL sur ordinateur : tout est dans lib.rs, que le
// téléphone appelle de son côté.

// Sur Windows, pas de fenêtre de console à côté de l'application.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    bts_ciel_lib::run();
}
