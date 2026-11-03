import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, inMemoryPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

const FIELDS = ["min", "included", "rate", "over200", "roundTripRate", "hourly"];
const TIMEOUT_MS = 12000;
const emit = (e) => window.onCloudUpdate && window.onCloudUpdate(e);
const sig = (v) => JSON.stringify(FIELDS.map(f => v && typeof v[f] === "number" ? v[f] : null));

function friendly(err) {
    if (err.code === "permission-denied") return "The database refused read access. Check the Firestore rules.";
    if (err.code === "unavailable") return "The pricing database cannot be reached.";
    return err.message || "Pricing database unavailable.";
}

if (Object.values(firebaseConfig).concat(ADMIN_EMAIL).some(v => String(v).includes("PASTE"))) {
    window.CloudPricing = { retry() {}, signIn: async () => "network", save: async () => { throw new Error("Firebase is not configured."); } };
    emit({ type: "error", message: "Firebase is not configured yet. See SETUP.md." });
} else {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const ref = doc(db, "config", "pricing");
    // In-memory only: Admin Access asks for the passcode again after every page load, as before.
    setPersistence(auth, inMemoryPersistence).catch(() => {});
    onAuthStateChanged(auth, (u) => window.onCloudAuth && window.onCloudAuth(!!u));

    let unsub = null, timer = null, gotServer = false;
    function subscribe() {
        if (unsub) unsub();
        clearTimeout(timer); gotServer = false;
        emit({ type: "loading" });
        timer = setTimeout(() => { if (!gotServer) emit({ type: "error", message: "Timed out contacting the pricing database." }); }, TIMEOUT_MS);
        unsub = onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
            const fromCache = snap.metadata.fromCache;
            if (fromCache && !gotServer) return; // never show cached data before the server answers
            if (!fromCache) { gotServer = true; clearTimeout(timer); }
            if (!snap.exists()) { emit({ type: "missing" }); return; }
            const d = snap.data();
            emit({ type: "data", stale: fromCache, data: { version: d.version, vehicles: d.vehicles, updatedAtMs: d.updatedAt && d.updatedAt.toMillis ? d.updatedAt.toMillis() : null } });
        }, (err) => { clearTimeout(timer); emit({ type: "error", message: friendly(err) }); });
    }

    async function signIn(pass) {
        try { await signInWithEmailAndPassword(auth, ADMIN_EMAIL, pass); return "ok"; }
        catch (err) {
            if (err.code === "auth/network-request-failed") return "network";
            if (err.code === "auth/too-many-requests") return "locked";
            return "denied";
        }
    }

    // changed: { vehicleKey: {six fields} } ; base: the values the admin started from (null = first publish)
    async function save(changed, base) {
        if (!auth.currentUser) throw Object.assign(new Error("Not signed in"), { code: "unauth" });
        return runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            const cur = snap.exists() ? snap.data() : null;
            const curV = cur ? cur.vehicles : {};
            const conflicts = base === null ? (cur ? Object.keys(changed) : []) : Object.keys(changed).filter(k => sig(curV[k]) !== sig(base[k]));
            if (conflicts.length) {
                throw Object.assign(new Error("Rates changed elsewhere"), { code: "conflict", keys: conflicts,
                    current: cur ? { version: cur.version, vehicles: cur.vehicles, updatedAtMs: cur.updatedAt && cur.updatedAt.toMillis ? cur.updatedAt.toMillis() : null } : { vehicles: {} } });
            }
            const version = (cur ? cur.version : 0) + 1;
            tx.set(ref, { version, updatedAt: serverTimestamp(), vehicles: Object.assign({}, curV, changed) });
            return version;
        });
    }

    window.CloudPricing = { signIn, save, retry: subscribe, signOut: () => signOut(auth) };
    subscribe();
}
