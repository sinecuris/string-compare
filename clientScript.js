// first things first: redirect to HTTPS if not localhost, since crypto.subtle is only available in a secure context
if (window.location.protocol === "http:" && !window.location.host.match(/localhost/)) {
  console.log("redirecting to https");
  window.location.protocol = "https:";
}

// utils

const arrayBufferToHexString = buffer =>
  Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

// adapted from https://stackoverflow.com/a/48161723
async function sha256(message) {
  // encode as UTF-8
  const msgBuffer = new TextEncoder().encode(message);
  // hash the message
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return arrayBufferToHexString(hashBuffer);
}

const generateEcdhKeySet = keyUsages =>
  window.crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-384" }, false, keyUsages);

// securely generates 128 random bits and returns them as a string
async function getSalt() {
  // generate public and private keys
  const public = (await generateEcdhKeySet(["deriveBits"])).publicKey;
  const private = (await generateEcdhKeySet(["deriveBits"])).privateKey;
  // generate a "shared secret"
  const secretBuffer = await window.crypto.subtle.deriveBits(
    { name: "ECDH", namedCurve: "P-384", public },
    private,
    128
  );
  return arrayBufferToHexString(secretBuffer);
}

const show = el => (el.style.display = "block");
const hide = el => (el.style.display = "none");

const go = location => {
  let path = "/" + location;
  if (location === "home") {
    path = "/";
  }
  if (window.location.pathname !== path) {
    window.history.replaceState(location, "", path);
  }
};

const error = msg => {
  msg = msg.toString();
  hide(happyPath);
  const header = document.createElement("h2");
  header.textContent = "ERROR";
  errorMessage.appendChild(header);
  msg.split("\n").forEach(line => {
    const p = document.createElement("p");
    p.textContent = line;
    errorMessage.appendChild(p);
  });
  const reloadButton = document.createElement("button");
  reloadButton.textContent = "Reload";
  reloadButton.onclick = () => (window.location.href = window.location.href);
  errorMessage.appendChild(reloadButton);
  show(errorMessage);
  go("error");
  throw new Error(msg);
};

const get = async (url, message) => {
  try {
    const res = await fetch(url);
    const status = res.status;
    const ret = {
      status,
    };
    if (status === 200) {
      ret.text = await res.text();
    }
    return ret;
  } catch (e) {
    const msg = message || "communicate with the server";
    error(`Error while trying to ${msg}.`);
  }
};

// we want to use web-native crypto, so fail fast if it isn't available
if (!crypto?.subtle?.digest || !crypto?.subtle?.generateKey || !crypto?.subtle?.deriveBits) {
  error(
    "Secure cryptography functions are not natively available in your browser, so this app will not work. Please use an updated modern browser.\n(This app has been tested in Chrome and Firefox.)"
  );
}

const startLoading = msg => {
  show(loadingSpinner);
  waitingMessage.textContent = msg.toString();
  show(waitingMessage);
};

const doneLoading = () => {
  hide(loadingSpinner);
  hide(waitingMessage);
};

// maintain state in a single place

const state = {};

// joining rooms

const join = async () => {
  const { roomId, salt } = state;
  if (!roomId) {
    error("Missing room ID.");
  } else if (!salt) {
    error("Missing salt.");
  }
  hide(roomJoinDiv);
  startLoading("Waiting for the other person to join the room.");
  go(`${roomId}#${salt}`);
  state.roomId = roomId;
  roomDisplay.textContent = roomId;
  // show(roomDisplay);
  // show(roomDisplayLabel);
  show(inviteLinkButton);
  const { status } = await get(`/join/${roomId}`, "join room");
  if (status === 404) {
    error(`Room ${roomId} not found.`);
  } else if (status === 503) {
    // Heroku sets a 30 second timeout on all requests before it returns 503
    error(`Timed out waiting for the other person to join.`);
  } else if (status !== 204) {
    error("Failed to join both people to the room.");
  }
  doneLoading();
  hide(inviteLinkButton);
  // hide(roomDisplayLabel);
  // hide(roomDisplay);
  show(inputDiv);
};

createRoomButton.onclick = async () => {
  hide(roomJoinDiv);
  startLoading("Waiting for the room to be created.");
  const { status, text } = await get("/newRoom", "create new room");
  if (status !== 200) {
    error("Server error while trying to create new room.");
  }
  state.roomId = text;
  startLoading("Generating salt.");
  try {
    state.salt = await getSalt();
  } catch (e) {
    error("Failed to generate salt.");
  }
  join();
};

joinRoomButton.onclick = async () => {
  hide(roomJoinDiv);
  show(loadingSpinner);
  const roomId = roomInput.value.trim().toUpperCase();
  join();
};

submitButton.onclick = async () => {
  const { roomId, salt } = state;
  if (!roomId) {
    error("Missing room ID.");
  } else if (!salt) {
    error("Missing salt.");
  }
  const input = stringInput.value.trim();
  let hash;
  try {
    hash = await sha256((await sha256(input)) + salt);
  } catch (e) {
    error("Failed to generate hash.");
  }
  hide(inputDiv);
  startLoading("Waiting for the other person to submit their string.");
  const { status, text } = await get(`/submit/${roomId}/${hash}`, "submit string");
  if (status === 404) {
    error(`Room ${roomId} not found.`);
  } else if (status === 418) {
    error(`Room ${roomId} is not ready.`);
  } else if (status === 503) {
    // Heroku sets a 30 second timeout on all requests before it returns 503
    error(`Timed out waiting for the other person to submit.`);
  } else if (status !== 200) {
    error("Server error while trying to check string.");
  }

  const display = match => {
    go("result");
    doneDisplay.textContent = match ? "MATCH" : "NO MATCH";
    doneDisplay.style.color = match ? "green" : "red";
    show(doneDisplay);
    doneLoading();
    doneDetails.textContent = `${match ? "You both entered" : "The other person did not enter"} the string "${input}"`;
    show(doneDetails);
  };

  if (text === "good") {
    display(true);
  } else if (text === "bad") {
    display(false);
  } else {
    error("Unrecognized response from server.");
  }
};

inviteLinkButton.onclick = async () => {
  const { roomId, salt } = state;

  const baseUrl = window.location.href.replace(window.location.pathname, "").replace(window.location.hash, "");
  inviteLinkInput.value = `${baseUrl}/${roomId}#${salt}`;

  show(inviteLinkInput);
  inviteLinkInput.select();
  inviteLinkInput.setSelectionRange(0, 99999); // For mobile devices
  navigator.clipboard.writeText(inviteLinkInput.value);
  hide(inviteLinkInput);
  // technically we should toast here, but the crypto stuff will probably happen fast enough
  // that we don't need to worry about the user navigating away before the copy operation finishes
};

// recognize if this is an invite link and join the room straight away
if (window.location.pathname.match(/^\/[A-Z]{8}$/) && window.location.hash.match(/^#[a-z0-9]{32}$/)) {
  state.roomId = window.location.pathname.replace(/\//g, "");
  state.salt = window.location.hash.replace(/#/g, "");
  join();
} else if (["/error", "/result", "/"].includes(window.location.pathname)) {
  go("home");
} else {
  error(`Invalid invite link '${window.location.pathname + window.location.hash}'`);
}
