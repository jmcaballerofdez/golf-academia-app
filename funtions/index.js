const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.mintTenantToken = onCall(async (request) => {
  const clubId = String(request.data?.clubId || "").trim().toLowerCase();

  if (!/^[a-z0-9-]{2,40}$/.test(clubId)) {
    throw new HttpsError("invalid-argument", "clubId no válido.");
  }

  const clubSnap = await db.collection("clubes").doc(clubId).get();

  if (!clubSnap.exists) {
    throw new HttpsError("not-found", `El club "${clubId}" no existe.`);
  }

  const club = clubSnap.data();
  if (club.activo === false) {
    throw new HttpsError("permission-denied", `El club "${clubId}" está desactivado.`);
  }

  const uid = `tenant_${clubId}`;
  const token = await admin.auth().createCustomToken(uid, { clubId });

  return { token };
});
