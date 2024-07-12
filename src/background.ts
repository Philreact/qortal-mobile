// @ts-nocheck
import Base58 from "./deps/Base58";
import { createTransaction } from "./transactions/transactions";
import { decryptChatMessage } from "./utils/decryptChatMessage";
import { decryptStoredWallet } from "./utils/decryptWallet";
import PhraseWallet from "./utils/generateWallet/phrase-wallet";
import { validateAddress } from "./utils/validateAddress";

// chrome.storage.local.clear(function() {
//   var error = chrome.runtime.lastError;
//   if (error) {
//       console.error(error);
//   } else {
//       console.log('Local storage cleared');
//   }
// });

export const walletVersion = 2;
// List of your API endpoints
const apiEndpoints = [
  "https://api.qortal.org",
  "https://api2.qortal.org",
  "https://appnode.qortal.org",
  "https://apinode.qortalnodes.live",
  "https://apinode1.qortalnodes.live",
  "https://apinode2.qortalnodes.live",
  "https://apinode3.qortalnodes.live",
  "https://apinode4.qortalnodes.live",
];

const pendingResponses = new Map();

// Function to check each API endpoint
async function findUsableApi() {
  for (const endpoint of apiEndpoints) {
    try {
      const response = await fetch(`${endpoint}/admin/status`);
      if (!response.ok) throw new Error("Failed to fetch");

      const data = await response.json();
      if (data.isSynchronizing === false && data.syncPercent === 100) {
        console.log(`Usable API found: ${endpoint}`);
        return endpoint;
      } else {
        console.log(`API not ready: ${endpoint}`);
      }
    } catch (error) {
      console.error(`Error checking API ${endpoint}:`, error);
    }
  }

  throw new Error("No usable API found");
}

async function getNameInfo() {
  const wallet = await getSaveWallet();
  const address = wallet.address0;
  const validApi = await findUsableApi();
  const response = await fetch(validApi + "/names/address/" + address);
  const nameData = await response.json();
  if (nameData?.length > 0) {
    return nameData[0].name;
  } else {
    return "";
  }
}
async function getAddressInfo(address) {
  const validApi = await findUsableApi();
  const response = await fetch(validApi + "/addresses/" + address);
  const data = await response.json();

  if (!response?.ok && data?.error !== 124)
    throw new Error("Cannot fetch address info");
  if (data?.error === 124) {
    return {
      address,
    };
  }
  return data;
}

async function getKeyPair() {
  const res = await chrome.storage.local.get(["keyPair"]);
  if (res?.keyPair) {
    return res.keyPair;
  } else {
    throw new Error("Wallet not authenticated");
  }
}

async function getSaveWallet() {
  const res = await chrome.storage.local.get(["walletInfo"]);
  if (res?.walletInfo) {
    return res.walletInfo;
  } else {
    throw new Error("No wallet saved");
  }
}

async function getUserInfo() {
  const wallet = await getSaveWallet();
  const address = wallet.address0;
  const addressInfo = await getAddressInfo(address);
  const name = await getNameInfo();
  return {
    name,
    ...addressInfo,
  };
}

async function connection(hostname) {
  const isConnected = chrome.storage.local.get([hostname]);
  return isConnected;
}

async function getBalanceInfo() {
  const wallet = await getSaveWallet();
  const address = wallet.address0;
  const validApi = await findUsableApi();
  const response = await fetch(validApi + "/addresses/balance/" + address);

  if (!response?.ok) throw new Error("Cannot fetch balance");
  const data = await response.json();
  return data;
}

const processTransactionVersion2 = async (body: any, validApi: string) => {
  // const validApi = await findUsableApi();
  const url = validApi + "/transactions/process?apiVersion=2";
  return fetch(url, {
    method: "POST",
    headers: {},
    body,
  }).then(async (response) => {
    try {
      const json = await response.clone().json();
      return json;
    } catch (e) {
      return await response.text();
    }
  });
};

const transaction = async (
  { type, params, apiVersion, keyPair }: any,
  validApi
) => {
  const tx = createTransaction(type, keyPair, params);
  let res;

  if (apiVersion && apiVersion === 2) {
    const signedBytes = Base58.encode(tx.signedBytes);
    res = await processTransactionVersion2(signedBytes, validApi);
  }

  return {
    success: true,
    data: res,
  };
};
const makeTransactionRequest = async (
  receiver,
  lastRef,
  amount,
  fee,
  keyPair,
  validApi
) => {
  const myTxnrequest = await transaction(
    {
      nonce: 0,
      type: 2,
      params: {
        recipient: receiver,
        // recipientName: recipientName,
        amount: amount,
        lastReference: lastRef,
        fee: fee,
      },
      apiVersion: 2,
      keyPair,
    },
    validApi
  );
  return myTxnrequest;
};

const getLastRef = async () => {
  const wallet = await getSaveWallet();
  const address = wallet.address0;
  const validApi = await findUsableApi();
  const response = await fetch(
    validApi + "/addresses/lastreference/" + address
  );
  if (!response?.ok) throw new Error("Cannot fetch balance");
  const data = await response.text();
  return data;
};
const sendQortFee = async () => {
  const validApi = await findUsableApi();
  const response = await fetch(
    validApi + "/transactions/unitfee?txType=PAYMENT"
  );

  if (!response.ok) {
    throw new Error("Error when fetching join fee");
  }

  const data = await response.json();
  const qortFee = (Number(data) / 1e8).toFixed(8);
  return qortFee;
};
async function getNameOrAddress(receiver) {
  try {
    const isAddress = validateAddress(receiver);
    if (isAddress) {
      return receiver;
    }
    const validApi = await findUsableApi();

    const response = await fetch(validApi + "/names/" + receiver);
    const data = await response.json();
    if (data?.owner) return data.owner;
    if (data?.error) {
      throw new Error("Name does not exist");
    }
    if (!response?.ok) throw new Error("Cannot fetch name");
    return { error: "cannot validate address or name" };
  } catch (error) {
    throw new Error(error?.message || "cannot validate address or name");
  }
}

async function decryptWallet({password, wallet, walletVersion}) {
  try {
    const response = await decryptStoredWallet(password, wallet);
    const wallet2 = new PhraseWallet(response, walletVersion);
    const keyPair = wallet2._addresses[0].keyPair;
    const toSave = {
      privateKey: Base58.encode(keyPair.privateKey),
  publicKey: Base58.encode(keyPair.publicKey)
    }
    const dataString = JSON.stringify(toSave)
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ keyPair: dataString }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(true);
        }
      });
    });

    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ walletInfo: wallet }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(true);
        }
      });
    });

    return true; 
  } catch (error) {
    console.log({error})
    throw new Error(error.message);
  }
}

async function sendCoin({ password, amount, receiver }, skipConfirmPassword) {
  try {
    const confirmReceiver = await getNameOrAddress(receiver);
    if (confirmReceiver.error)
      throw new Error("Invalid receiver address or name");
    const wallet = await getSaveWallet();
    let keyPair = ''
    if(skipConfirmPassword){
      const resKeyPair = await getKeyPair()
      const parsedData = JSON.parse(resKeyPair)
      const uint8PrivateKey = Base58.decode(parsedData.privateKey);
      const uint8PublicKey = Base58.decode(parsedData.publicKey);
      keyPair = {
        privateKey: uint8PrivateKey,
        publicKey: uint8PublicKey
      };
    } else {
      const response = await decryptStoredWallet(password, wallet);
    const wallet2 = new PhraseWallet(response, walletVersion);

    keyPair = wallet2._addresses[0].keyPair
    }
    

    const lastRef = await getLastRef();
    const fee = await sendQortFee();
    const validApi = await findUsableApi();

    const res = await makeTransactionRequest(
      confirmReceiver,
      lastRef,
      amount,
      fee,
      keyPair,
      validApi
    );
    return { res, validApi };
  } catch (error) {
    throw new Error(error.message);
  }
}

function fetchMessages(apiCall) {
  let retryDelay = 2000; // Start with a 2-second delay
  const maxDuration = 360000; // Maximum duration set to 6 minutes
  const startTime = Date.now(); // Record the start time

  // Promise to handle polling logic
  return new Promise((resolve, reject) => {
      const attemptFetch = async () => {
          if (Date.now() - startTime > maxDuration) {
              return reject(new Error("Maximum polling time exceeded"));
          }

          try {
              const response = await fetch(apiCall);
              const data = await response.json();
              if (data && data.length > 0) {
                  resolve(data[0]); // Resolve the promise when data is found
              } else {
                  setTimeout(attemptFetch, retryDelay);
                  retryDelay = Math.min(retryDelay * 2, 360000); // Ensure delay does not exceed 6 minutes
              }
          } catch (error) {
              reject(error); // Reject the promise on error
          }
      };

      attemptFetch(); // Initial call to start the polling
  });
}

async function listenForChatMessage({ nodeBaseUrl, senderAddress, senderPublicKey, timestamp }) {
  try {
    let validApi = "";
    const checkIfNodeBaseUrlIsAcceptable = apiEndpoints.find(
      (item) => item === nodeBaseUrl
    );
    if (checkIfNodeBaseUrlIsAcceptable) {
      validApi = checkIfNodeBaseUrlIsAcceptable;
    } else {
      validApi = await findUsableApi();
    }
    const wallet = await getSaveWallet();
    const address = wallet.address0;
    const before = timestamp + 5000
    const after = timestamp - 5000
    const apiCall = `${validApi}/chat/messages?involving=${senderAddress}&involving=${address}&reverse=true&limit=1&before=${before}&after=${after}`;
    const encodedMessageObj = await fetchMessages(apiCall)
   
    const resKeyPair = await getKeyPair()
      const parsedData = JSON.parse(resKeyPair)
      const uint8PrivateKey = Base58.decode(parsedData.privateKey);
      const uint8PublicKey = Base58.decode(parsedData.publicKey);
      const keyPair = {
        privateKey: uint8PrivateKey,
        publicKey: uint8PublicKey
      };
    const decodedMessage =  decryptChatMessage(encodedMessageObj.data, keyPair.privateKey, senderPublicKey, encodedMessageObj.reference)
    return { secretCode: decodedMessage };
  } catch (error) {
    console.error(error)
    throw new Error(error.message);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request) {
    switch (request.action) {
      case "version":
        // Example: respond with the version
        sendResponse({ version: "1.0" });
        break;
      case "storeWalletInfo":
        chrome.storage.local.set({ walletInfo: request.wallet }, () => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ result: "Data saved successfully" });
          }
        });
        break;
      case "getWalletInfo":
       
          getKeyPair().then(()=> {
            chrome.storage.local.get(["walletInfo"], (result) => {
              if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
              } else if (result.walletInfo) {
                sendResponse({ walletInfo: result.walletInfo });
              } else {
                sendResponse({ error: "No wallet info found" });
              }
            });
          }).catch((error)=> {
            sendResponse({ error: error.message });
          })
        
        break;
      case "validApi":
        findUsableApi()
          .then((usableApi) => {
            console.log("Usable API:", usableApi);
          })
          .catch((error) => {
            console.error(error.message);
          });
      case "name":
        getNameInfo()
          .then((name) => {
            sendResponse(name);
          })
          .catch((error) => {
            console.error(error.message);
          });
        break;
      case "userInfo":
        getUserInfo()
          .then((name) => {
            sendResponse(name);
          })
          .catch((error) => {
            sendResponse({ error: "User not authenticated" });
            console.error(error.message);
          });
        break;
        case "decryptWallet": {
          const { password, wallet } = request.payload;

          decryptWallet({
            password, wallet, walletVersion
          })
            .then((hasDecrypted) => {
              sendResponse(hasDecrypted);
            })
            .catch((error) => {
              sendResponse({ error: error?.message });
              console.error(error.message);
            });
        }
       
        break;
      case "balance":
        getBalanceInfo()
          .then((balance) => {
            sendResponse(balance);
          })
          .catch((error) => {
            console.error(error.message);
          });
        break;
      case "sendCoin":
        {
          const { receiver, password, amount } = request.payload;
          sendCoin({ receiver, password, amount })
            .then(() => {
              sendResponse(true);
            })
            .catch((error) => {
              sendResponse({ error: error.message });
              console.error(error.message);
            });
        }

        break;

      case "oauth": {
        const { nodeBaseUrl, senderAddress, senderPublicKey, timestamp } = request.payload;

        listenForChatMessage({ nodeBaseUrl, senderAddress, senderPublicKey, timestamp })
          .then(({ secretCode }) => {
            sendResponse(secretCode);
          })
          .catch((error) => {
            sendResponse({ error: error.message });
            console.error(error.message);
          });

        break;
      }
      case "authentication":
        {
          getSaveWallet()
            .then(() => {
              sendResponse(true);
            })
            .catch((error) => {
              const popupUrl = chrome.runtime.getURL("index.html");

              chrome.windows.getAll(
                { populate: true, windowTypes: ["popup"] },
                (windows) => {
                  // Attempt to find an existing popup window that has a tab with the correct URL
                  const existingPopup = windows.find(
                    (w) =>
                      w.tabs &&
                      w.tabs.some(
                        (tab) => tab.url && tab.url.startsWith(popupUrl)
                      )
                  );
                  if (existingPopup) {
                    // If the popup exists but is minimized or not focused, focus it
                    chrome.windows.update(existingPopup.id, {
                      focused: true,
                      state: "normal",
                    });
                  } else {
                    // No existing popup found, create a new one
                    chrome.system.display.getInfo((displays) => {
                      // Assuming the primary display is the first one (adjust logic as needed)
                      const primaryDisplay = displays[0];
                      const screenWidth = primaryDisplay.bounds.width;
                      const windowHeight = 500; // Your window height
                      const windowWidth = 400; // Your window width

                      // Calculate left position for the window to appear on the right of the screen
                      const leftPosition = screenWidth - windowWidth;

                      // Calculate top position for the window, adjust as desired
                      const topPosition =
                        (primaryDisplay.bounds.height - windowHeight) / 2;

                      chrome.windows.create({
                        url: chrome.runtime.getURL("index.html"),
                        type: "popup",
                        width: windowWidth,
                        height: windowHeight,
                        left: leftPosition,
                        top: 0,
                      });
                    });
                  }

                  const interactionId = Date.now().toString(); // Simple example; consider a better unique ID

                  setTimeout(() => {
                    chrome.runtime.sendMessage({
                      action: "SET_COUNTDOWN",
                      payload: request.timeout ? 0.75 * request.timeout : 60,
                    });
                    chrome.runtime.sendMessage({
                      action: "UPDATE_STATE_REQUEST_AUTHENTICATION",
                      payload: {
                        hostname,
                        interactionId,
                      },
                    });
                  }, 500);

                  // Store sendResponse callback with the interaction ID
                  pendingResponses.set(interactionId, sendResponse);
                  let intervalId = null;
                  const startTime = Date.now();
                  const checkInterval = 3000; // Check every 3 seconds
                  const timeout = request.timeout
                    ? 0.75 * (request.timeout * 1000)
                    : 60000; // Stop after 15 seconds

                  const checkFunction = () => {
                    getSaveWallet()
                      .then(() => {
                        clearInterval(intervalId); // Stop checking
                        sendResponse(true); // Perform the success action
                        chrome.runtime.sendMessage({
                          action: "closePopup",
                        });
                      })
                      .catch((error) => {
                        // Handle error if needed
                      });

                    if (Date.now() - startTime > timeout) {
                      sendResponse({
                        error: "User has not authenticated, try again.",
                      });
                      clearInterval(intervalId); // Stop checking due to timeout
                      console.log("Timeout exceeded");
                      // Handle timeout situation if needed
                    }
                  };

                  intervalId = setInterval(checkFunction, checkInterval);
                }
              );
            });
        }
        break;
      case "connection":
        const { hostname } = request.payload;
        connection(hostname)
          .then((isConnected) => {
            if (Object.keys(isConnected)?.length > 0 && isConnected[hostname]) {
              sendResponse(true);
            } else {
              const popupUrl = chrome.runtime.getURL("index.html");

              chrome.windows.getAll(
                { populate: true, windowTypes: ["popup"] },
                (windows) => {
                  // Attempt to find an existing popup window that has a tab with the correct URL
                  const existingPopup = windows.find(
                    (w) =>
                      w.tabs &&
                      w.tabs.some(
                        (tab) => tab.url && tab.url.startsWith(popupUrl)
                      )
                  );
                  if (existingPopup) {
                    // If the popup exists but is minimized or not focused, focus it
                    chrome.windows.update(existingPopup.id, {
                      focused: true,
                      state: "normal",
                    });
                  } else {
                    // No existing popup found, create a new one
                    chrome.system.display.getInfo((displays) => {
                      // Assuming the primary display is the first one (adjust logic as needed)
                      const primaryDisplay = displays[0];
                      const screenWidth = primaryDisplay.bounds.width;
                      const windowHeight = 500; // Your window height
                      const windowWidth = 400; // Your window width

                      // Calculate left position for the window to appear on the right of the screen
                      const leftPosition = screenWidth - windowWidth;

                      // Calculate top position for the window, adjust as desired
                      const topPosition =
                        (primaryDisplay.bounds.height - windowHeight) / 2;

                      chrome.windows.create({
                        url: chrome.runtime.getURL("index.html"),
                        type: "popup",
                        width: windowWidth,
                        height: windowHeight,
                        left: leftPosition,
                        top: 0,
                      });
                    });
                  }

                  const interactionId = Date.now().toString(); // Simple example; consider a better unique ID

                  setTimeout(() => {
                    chrome.runtime.sendMessage({
                      action: "SET_COUNTDOWN",
                      payload: request.timeout ? 0.9 * request.timeout : 20,
                    });
                    chrome.runtime.sendMessage({
                      action: "UPDATE_STATE_REQUEST_CONNECTION",
                      payload: {
                        hostname,
                        interactionId,
                      },
                    });
                  }, 500);

                  // Store sendResponse callback with the interaction ID
                  pendingResponses.set(interactionId, sendResponse);
                }
              );
            }
          })
          .catch((error) => {
            console.error(error.message);
          });
        break;
      case "sendQort":
        {
          const { amount, hostname, address, description } = request.payload;
          const popupUrl = chrome.runtime.getURL("index.html");

          chrome.windows.getAll(
            { populate: true, windowTypes: ["popup"] },
            (windows) => {
              // Attempt to find an existing popup window that has a tab with the correct URL
              const existingPopup = windows.find(
                (w) =>
                  w.tabs &&
                  w.tabs.some((tab) => tab.url && tab.url.startsWith(popupUrl))
              );
              if (existingPopup) {
                // If the popup exists but is minimized or not focused, focus it
                chrome.windows.update(existingPopup.id, {
                  focused: true,
                  state: "normal",
                });
              } else {
                // No existing popup found, create a new one
                chrome.system.display.getInfo((displays) => {
                  // Assuming the primary display is the first one (adjust logic as needed)
                  const primaryDisplay = displays[0];
                  const screenWidth = primaryDisplay.bounds.width;
                  const windowHeight = 500; // Your window height
                  const windowWidth = 400; // Your window width

                  // Calculate left position for the window to appear on the right of the screen
                  const leftPosition = screenWidth - windowWidth;

                  // Calculate top position for the window, adjust as desired
                  const topPosition =
                    (primaryDisplay.bounds.height - windowHeight) / 2;

                  chrome.windows.create({
                    url: chrome.runtime.getURL("index.html"),
                    type: "popup",
                    width: windowWidth,
                    height: windowHeight,
                    left: leftPosition,
                    top: 0,
                  });
                });
              }

              const interactionId = Date.now().toString(); // Simple example; consider a better unique ID

              setTimeout(() => {
                chrome.runtime.sendMessage({
                  action: "SET_COUNTDOWN",
                  payload: (request.timeout ? request.timeout : 60) - 6,
                });
                chrome.runtime.sendMessage({
                  action: "UPDATE_STATE_CONFIRM_SEND_QORT",
                  payload: {
                    amount,
                    address,
                    hostname,
                    description,
                    interactionId,
                  },
                });
              }, 500);

              // Store sendResponse callback with the interaction ID
              pendingResponses.set(interactionId, sendResponse);
            }
          );
        }

        break;
      case "responseToConnectionRequest":
        {
          const { hostname, isOkay } = request.payload;
          const interactionId3 = request.payload.interactionId;
          if (!isOkay) {
            const originalSendResponse = pendingResponses.get(interactionId3);
            if (originalSendResponse) {
              originalSendResponse(false);
              sendResponse(false);
            }
          } else {
            const originalSendResponse = pendingResponses.get(interactionId3);
            if (originalSendResponse) {
              // Example of setting domain permission
              chrome.storage.local.set({ [hostname]: true });

              originalSendResponse(true);
              sendResponse(true);
            }
          }

          pendingResponses.delete(interactionId3);
        }

        break;
      case "sendQortConfirmation":
        const { password, amount, receiver, isDecline } = request.payload;
        const interactionId2 = request.payload.interactionId;
        // Retrieve the stored sendResponse callback
        const originalSendResponse = pendingResponses.get(interactionId2);

        if (originalSendResponse) {
          if (isDecline) {
            originalSendResponse({ error: "User has declined" });
            sendResponse(false);
            pendingResponses.delete(interactionId2);
            return;
          }
          sendCoin({ password, amount, receiver }, true)
            .then((res) => {
              sendResponse(true);
              // Use the sendResponse callback to respond to the original message
              originalSendResponse(res);
              // Remove the callback from the Map as it's no longer needed
              pendingResponses.delete(interactionId2);
              // chrome.runtime.sendMessage({
              //   action: "closePopup",
              // });
            })
            .catch((error) => {
              console.error(error.message);
              sendResponse({ error: error.message });
              originalSendResponse({ error: error.message });
            });

        }

        break;
      case "logout":
        {
          chrome.storage.local.remove(["keyPair", "walletInfo"], () => {
            if (chrome.runtime.lastError) {
              // Handle error
              console.error(chrome.runtime.lastError.message);
            } else {
              chrome.tabs.query({}, function(tabs) {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, { type: "LOGOUT" });
                });
            });
              // Data removed successfully
              sendResponse(true);
            }
          });
        }

        break;
    }
  }
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  const popupUrl = chrome.runtime.getURL("index.html");
  chrome.windows.getAll(
    { populate: true, windowTypes: ["popup"] },
    (windows) => {
      // Attempt to find an existing popup window that has a tab with the correct URL
      const existingPopup = windows.find(
        (w) =>
          w.tabs &&
          w.tabs.some((tab) => tab.url && tab.url.startsWith(popupUrl))
      );
      if (existingPopup) {
        // If the popup exists but is minimized or not focused, focus it
        chrome.windows.update(existingPopup.id, {
          focused: true,
          state: "normal",
        });
      } else {
        // No existing popup found, create a new one
        chrome.system.display.getInfo((displays) => {
          // Assuming the primary display is the first one (adjust logic as needed)
          const primaryDisplay = displays[0];
          const screenWidth = primaryDisplay.bounds.width;
          const windowHeight = 500; // Your window height
          const windowWidth = 400; // Your window width

          // Calculate left position for the window to appear on the right of the screen
          const leftPosition = screenWidth - windowWidth;

          // Calculate top position for the window, adjust as desired
          const topPosition = (primaryDisplay.bounds.height - windowHeight) / 2;

          chrome.windows.create({
            url: chrome.runtime.getURL("index.html"),
            type: "popup",
            width: windowWidth,
            height: windowHeight,
            left: leftPosition,
            top: 0,
          });
        });
      }

      const interactionId = Date.now().toString(); // Simple example; consider a better unique ID

      setTimeout(() => {
        chrome.runtime.sendMessage({
          action: "UPDATE_STATE_REQUEST_CONNECTION",
          payload: {
            hostname,
            interactionId,
          },
        });
      }, 500);

      // Store sendResponse callback with the interaction ID
      pendingResponses.set(interactionId, sendResponse);
    }
  );
});
