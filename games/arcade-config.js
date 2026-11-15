// Where the arcade's accounts and leaderboards live. Fill these in after setting up Supabase
// (see SETUP.md). Both are fine to publish: the key only lets the site call the arcade's own
// functions (sign in, submit a score, ...), never read or change the tables directly.
window.ARCADE_CONFIG = {
  supabaseUrl: "YOUR-PROJECT-URL",       // looks like https://abcdefghijkl.supabase.co
  supabaseKey: "YOUR-PUBLISHABLE-KEY",   // Project Settings -> API Keys -> the publishable (or "anon") key
};
