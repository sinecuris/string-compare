// utils

// copied and pasted from https://stackoverflow.com/a/48161723
async function sha256(message) {
  // encode as UTF-8
  const msgBuffer = new TextEncoder().encode(message);
  // hash the message
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  // convert ArrayBuffer to Array
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // convert bytes to hex string
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

const show = el => (el.style.display = "block");
const hide = el => (el.style.display = "none");

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
  show(errorMessage);
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

// want to use web-native crypto, so fail fast if it isn't available
if (!crypto?.subtle?.digest) {
  error(
    "Secure hashing functions are not natively available in your browser, so this app will not work.Please use an updated modern browser.\n(This app has been tested in Chrome and Firefox.)"
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

const join = async roomId => {
  state.roomId = roomId;
  roomDisplay.textContent = roomId;
  show(roomDisplay);
  show(roomDisplayLabel);
  startLoading("Waiting for the other person to join the room.");
  const { status: joinStatus } = await get(`/join/${roomId}`, "join room");
  if (joinStatus === 404) {
    error(`Room ${roomId} not found.`);
  } else if (joinStatus !== 204) {
    error("Failed to join both people to the room.");
  }
  doneLoading();
  hide(roomDisplayLabel);
  hide(roomDisplay);
  show(inputDiv);
};

createRoomButton.onclick = async () => {
  hide(roomJoinDiv);
  startLoading("Waiting for the room to be created.");
  const { status, text: roomId } = await get("/newRoom", "create new room");
  if (status !== 200) {
    error("Server error while trying to create new room.");
  }
  join(roomId);
};

joinRoomButton.onclick = async () => {
  hide(roomJoinDiv);
  show(loadingSpinner);
  const roomId = roomInput.value.trim().toUpperCase();
  join(roomId);
};

submitButton.onclick = async () => {
  const { roomId } = state;
  const input = stringInput.value.trim();
  const hash = await sha256(input);
  hide(inputDiv);
  startLoading("Waiting for the other person to submit their string.");
  const { status, text } = await get(`/submit/${roomId}/${hash}`, "submit string");
  if (status === 404) {
    error(`Room ${roomId} not found.`);
  } else if (status === 418) {
    error(`Room ${roomId} is not ready.`);
  } else if (status !== 200) {
    error("Server error while trying to check string.");
  }

  const display = match => {
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
