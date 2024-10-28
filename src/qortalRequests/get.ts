import {
  computePow,
  createEndpoint,
  getBalanceInfo,
  getFee,
  getKeyPair,
  getLastRef,
  getSaveWallet,
  processTransactionVersion2,
  removeDuplicateWindow,
  signChatFunc,
  joinGroup as joinGroupFunc,
  sendQortFee,
  sendCoin as sendCoinFunc,
  isUsingLocal
} from "../background";
import { getNameInfo } from "../backgroundFunctions/encryption";
import { QORT_DECIMALS } from "../constants/constants";
import Base58 from "../deps/Base58";
import {
  base64ToUint8Array,
  decryptDeprecatedSingle,
  decryptGroupDataQortalRequest,
  encryptDataGroup,
  uint8ArrayStartsWith,
  uint8ArrayToBase64,
} from "../qdn/encryption/group-encryption";
import { publishData } from "../qdn/publish/pubish";
import { getPermission, setPermission } from "../qortalRequests";
import { createTransaction } from "../transactions/transactions";
import { mimeToExtensionMap } from "../utils/memeTypes";


const btcFeePerByte = 0.00000100
const ltcFeePerByte = 0.00000030
const dogeFeePerByte = 0.00001000
const dgbFeePerByte = 0.00000010
const rvnFeePerByte = 0.00001125


const _createPoll = async ({pollName, pollDescription, options}, isFromExtension) => {
  const fee = await getFee("CREATE_POLL");

  const resPermission = await getUserPermission({
    text1: "You are requesting to create the poll below:",
    text2: `Poll: ${pollName}`,
    text3: `Description: ${pollDescription}`,
    text4: `Options: ${options?.join(", ")}`,
    fee: fee.fee,
  }, isFromExtension);
  const { accepted } = resPermission;

  if (accepted) {
    const wallet = await getSaveWallet();
    const address = wallet.address0;
    const resKeyPair = await getKeyPair();
    const parsedData = JSON.parse(resKeyPair);
    const uint8PrivateKey = Base58.decode(parsedData.privateKey);
    const uint8PublicKey = Base58.decode(parsedData.publicKey);
    const keyPair = {
      privateKey: uint8PrivateKey,
      publicKey: uint8PublicKey,
    };
    let lastRef = await getLastRef();

    const tx = await createTransaction(8, keyPair, {
      fee: fee.fee,
      ownerAddress: address,
      rPollName: pollName,
      rPollDesc: pollDescription,
      rOptions: options,
      lastReference: lastRef,
    });
    const signedBytes = Base58.encode(tx.signedBytes);
    const res = await processTransactionVersion2(signedBytes);
    if (!res?.signature)
      throw new Error(res?.message || "Transaction was not able to be processed");
    return res;
  } else {
    throw new Error("User declined request");
  }
};

const _deployAt = async (
  {name,
  description,
  tags,
  creationBytes,
  amount,
  assetId,
  atType}, isFromExtension
) => {
  const fee = await getFee("DEPLOY_AT");

  const resPermission = await getUserPermission({
    text1: "Would you like to deploy this AT?",
    text2: `Name: ${name}`,
    text3: `Description: ${description}`,
    fee: fee.fee,
  }, isFromExtension);

  const { accepted } = resPermission;

  if (accepted) {
    const wallet = await getSaveWallet();
    const address = wallet.address0;
    const lastReference = await getLastRef();
    const resKeyPair = await getKeyPair();
    const parsedData = JSON.parse(resKeyPair);
    const uint8PrivateKey = Base58.decode(parsedData.privateKey);
    const uint8PublicKey = Base58.decode(parsedData.publicKey);
    const keyPair = {
      privateKey: uint8PrivateKey,
      publicKey: uint8PublicKey,
    };

    const tx = await createTransaction(16, keyPair, {
      fee: fee.fee,
      rName: name,
      rDescription: description,
      rTags: tags,
      rAmount: amount,
      rAssetId: assetId,
      rCreationBytes: creationBytes,
      atType: atType,
      lastReference: lastReference,
    });

    const signedBytes = Base58.encode(tx.signedBytes);

    const res = await processTransactionVersion2(signedBytes);
    if (!res?.signature)
      throw new Error(
        res?.message || "Transaction was not able to be processed"
      );
    return res;
  } else {
    throw new Error("User declined transaction");
  }
};

const _voteOnPoll = async ({pollName, optionIndex, optionName}, isFromExtension) => {
  const fee = await getFee("VOTE_ON_POLL");

  const resPermission = await getUserPermission({
    text1: "You are being requested to vote on the poll below:",
    text2: `Poll: ${pollName}`,
    text3: `Option: ${optionName}`,
    fee: fee.fee,
  }, isFromExtension);
  const { accepted } = resPermission;

  if (accepted) {
    const wallet = await getSaveWallet();
    const address = wallet.address0;
    const resKeyPair = await getKeyPair();
    const parsedData = JSON.parse(resKeyPair);
    const uint8PrivateKey = Base58.decode(parsedData.privateKey);
    const uint8PublicKey = Base58.decode(parsedData.publicKey);
    const keyPair = {
      privateKey: uint8PrivateKey,
      publicKey: uint8PublicKey,
    };
    let lastRef = await getLastRef();

    const tx = await createTransaction(9, keyPair, {
      fee: fee.fee,
      voterAddress: address,
      rPollName: pollName,
      rOptionIndex: optionIndex,
      lastReference: lastRef,
    });
    const signedBytes = Base58.encode(tx.signedBytes);
    const res = await processTransactionVersion2(signedBytes);
    if (!res?.signature)
      throw new Error(res?.message || "Transaction was not able to be processed");
    return res;
  } else {
    throw new Error("User declined request");
  }
};

function getFileFromContentScript(fileId, sender) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      sender.tab.id,
      { action: "getFileFromIndexedDB", fileId: fileId },
      (response) => {
        if (response && response.result) {
          resolve(response.result);
        } else {
          reject(response?.error || "Failed to retrieve file");
        }
      }
    );
  });
}
function sendToSaveFilePicker(data, sender) {

  chrome.tabs.sendMessage(sender.tab.id, {
    action: "SHOW_SAVE_FILE_PICKER",
    data,
  });
}

async function responseFromExtension() {
  return new Promise((resolve) => {
  
    // Send message to the content script to check focus
    chrome.runtime.sendMessage({ action: "QORTAL_REQUEST_PERMISSION", payloa }, (response) => {

      if (chrome.runtime.lastError) {
        resolve(false); // Error occurred, assume not focused
      } else {
        resolve(response); // Resolve based on the response
      }
    });
  });
}

async function getUserPermission(payload: any, isFromExtension?: boolean) {
  function waitForWindowReady(windowId) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        chrome.windows.get(windowId, (win) => {
          if (chrome.runtime.lastError) {
            clearInterval(checkInterval); // Stop polling if there's an error
            resolve(false);
          } else if (win.state === "normal" || win.state === "maximized") {
            clearInterval(checkInterval); // Window is ready
            resolve(true);
          }
        });
      }, 100); // Check every 100ms
    });
  }

  if(isFromExtension){


    return new Promise((resolve) => {
      // Set a timeout for 1 second
      const timeout = setTimeout(() => {
        resolve(false); 
      }, 30000);
  
      // Send message to the content script to check focus
      chrome.runtime.sendMessage(
        { action: "QORTAL_REQUEST_PERMISSION", payload, isFromExtension },
        (response) => {
          if (response === undefined) return;
          clearTimeout(timeout); // Clear the timeout if we get a response
  
          if (chrome.runtime.lastError) {
            resolve(false); // Error occurred, assume not focused
          } else {
            resolve(response); // Resolve based on the response
          }
        }
      );
    });
  }
  await new Promise((res) => {
    const popupUrl = chrome.runtime.getURL("index.html?secondary=true");
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
          res(null);
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

            chrome.windows.create(
              {
                url: popupUrl,
                type: "popup",
                width: windowWidth,
                height: windowHeight,
                left: leftPosition,
                top: 0,
              },
              async (newWindow) => {
                removeDuplicateWindow(popupUrl);
                await waitForWindowReady(newWindow.id);

                res(null);
              }
            );
          });
        }
      }
    );
  });

  await new Promise((res) => {
    setTimeout(() => {
      chrome.runtime.sendMessage({
        action: "SET_COUNTDOWN",
        payload: 30,
      });
      res(true);
    }, 1000);
  });
  return new Promise((resolve) => {
    // Set a timeout for 1 second
    const timeout = setTimeout(() => {
      resolve(false); 
    }, 30000);

    // Send message to the content script to check focus
    chrome.runtime.sendMessage(
      { action: "QORTAL_REQUEST_PERMISSION", payload },
      (response) => {
        if (response === undefined) return;
        clearTimeout(timeout); // Clear the timeout if we get a response

        if (chrome.runtime.lastError) {
          resolve(false); // Error occurred, assume not focused
        } else {
          resolve(response); // Resolve based on the response
        }
      }
    );
  });
}

export const getUserAccount = async () => {
  try {
    const wallet = await getSaveWallet();
    const address = wallet.address0;
    const publicKey = wallet.publicKey;
    return {
      address,
      publicKey,
    };
  } catch (error) {
    throw new Error("Unable to fetch user account");
  }
};

export const encryptData = async (data, sender) => {
  let data64 = data.data64;
  let publicKeys = data.publicKeys || [];
  if (data.fileId) {
    data64 = await getFileFromContentScript(data.fileId, sender);
  }
  if (!data64) {
    throw new Error("Please include data to encrypt");
  }

  const resKeyPair = await getKeyPair();
  const parsedData = JSON.parse(resKeyPair);
  const privateKey = parsedData.privateKey;
  const userPublicKey = parsedData.publicKey;

  const encryptDataResponse = encryptDataGroup({
    data64,
    publicKeys: publicKeys,
    privateKey,
    userPublicKey,
  });
  if (encryptDataResponse) {
    return encryptDataResponse;
  } else {
    throw new Error("Unable to encrypt");
  }
};
export const decryptData = async (data) => {
  const { encryptedData, publicKey } = data;

  if (!encryptedData) {
    throw new Error(`Missing fields: encryptedData`);
  }
  const resKeyPair = await getKeyPair();
  const parsedData = JSON.parse(resKeyPair);
  const uint8PrivateKey = Base58.decode(parsedData.privateKey);
  const uint8Array = base64ToUint8Array(encryptedData);
  const startsWithQortalEncryptedData = uint8ArrayStartsWith(
    uint8Array,
    "qortalEncryptedData"
  );
  if (startsWithQortalEncryptedData) {
    if (!publicKey) {
      throw new Error(`Missing fields: publicKey`);
    }

    const decryptedDataToBase64 = decryptDeprecatedSingle(
      uint8Array,
      publicKey,
      uint8PrivateKey
    );
    return decryptedDataToBase64;
  }
  const startsWithQortalGroupEncryptedData = uint8ArrayStartsWith(
    uint8Array,
    "qortalGroupEncryptedData"
  );
  if (startsWithQortalGroupEncryptedData) {
    const decryptedData = decryptGroupDataQortalRequest(
      encryptedData,
      parsedData.privateKey
    );
    const decryptedDataToBase64 = uint8ArrayToBase64(decryptedData);
    return decryptedDataToBase64;
  }
  throw new Error("Unable to decrypt");
};

export const getListItems = async (data, isFromExtension) => {
    const localNodeAvailable = await isUsingLocal()
    if(!localNodeAvailable) throw new Error('Please use your local node.')
  const requiredFields = ["list_name"];
  const missingFields: string[] = [];
  requiredFields.forEach((field) => {
    if (!data[field]) {
      missingFields.push(field);
    }
  });
  if (missingFields.length > 0) {
    const missingFieldsString = missingFields.join(", ");
    const errorMsg = `Missing fields: ${missingFieldsString}`;
    throw new Error(errorMsg);
  }
  const value = (await getPermission("qAPPAutoLists")) || false;

  let skip = false;
  if (value) {
    skip = true;
  }
  let resPermission;
  let acceptedVar;
  let checkbox1Var;
  if (!skip) {
    resPermission = await getUserPermission({
      text1: "Do you give this application permission to",
      text2: "Access the list",
      highlightedText: data.list_name,
      checkbox1: {
        value: value,
        label: "Always allow lists to be retrieved automatically",
      },
    }, isFromExtension);
    const { accepted, checkbox1 } = resPermission;
    acceptedVar = accepted;
    checkbox1Var = checkbox1;
    setPermission("qAPPAutoLists", checkbox1);
  }

  if (acceptedVar || skip) {
    const url = await createEndpoint(`/lists/${data.list_name}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch");

    const list = await response.json();
    return list;
  } else {
    throw new Error("User declined to share list");
  }
};

export const addListItems = async (data, isFromExtension) => {
    const localNodeAvailable = await isUsingLocal()
    if(!localNodeAvailable) throw new Error('Please use your local node.')
  const requiredFields = ["list_name", "items"];
  const missingFields: string[] = [];
  requiredFields.forEach((field) => {
    if (!data[field]) {
      missingFields.push(field);
    }
  });
  if (missingFields.length > 0) {
    const missingFieldsString = missingFields.join(", ");
    const errorMsg = `Missing fields: ${missingFieldsString}`;
    throw new Error(errorMsg);
  }

  const items = data.items;
  const list_name = data.list_name;

  const resPermission = await getUserPermission({
    text1: "Do you give this application permission to",
    text2: `Add the following to the list ${list_name}:`,
    highlightedText: items.join(", "),
  }, isFromExtension);
  const { accepted } = resPermission;

  if (accepted) {
    const url = await createEndpoint(`/lists/${list_name}`);
    const body = {
      items: items,
    };
    const bodyToString = JSON.stringify(body);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: bodyToString,
    });

    if (!response.ok) throw new Error("Failed to add to list");
    let res;
    try {
      res = await response.clone().json();
    } catch (e) {
      res = await response.text();
    }
    return res;
  } else {
    throw new Error("User declined add to list");
  }
};

export const deleteListItems = async (data, isFromExtension) => {
    const localNodeAvailable = await isUsingLocal()
    if(!localNodeAvailable) throw new Error('Please use your local node.')
  const requiredFields = ["list_name", "item"];
  const missingFields: string[] = [];
  requiredFields.forEach((field) => {
    if (!data[field]) {
      missingFields.push(field);
    }
  });
  if (missingFields.length > 0) {
    const missingFieldsString = missingFields.join(", ");
    const errorMsg = `Missing fields: ${missingFieldsString}`;
    throw new Error(errorMsg);
  }

  const item = data.item;
  const list_name = data.list_name;

  const resPermission = await getUserPermission({
    text1: "Do you give this application permission to",
    text2: `Remove the following from the list ${list_name}:`,
    highlightedText: item,
  }, isFromExtension);
  const { accepted } = resPermission;

  if (accepted) {
    const url = await createEndpoint(`/lists/${list_name}`);
    const body = {
      items: [item],
    };
    const bodyToString = JSON.stringify(body);
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: bodyToString,
    });

    if (!response.ok) throw new Error("Failed to add to list");
    let res;
    try {
      res = await response.clone().json();
    } catch (e) {
      res = await response.text();
    }
    return res;
  } else {
    throw new Error("User declined delete from list");
  }
};

export const publishQDNResource = async (data: any, sender, isFromExtension) => {
  const requiredFields = ["service"];
  const missingFields: string[] = [];
  requiredFields.forEach((field) => {
    if (!data[field]) {
      missingFields.push(field);
    }
  });
  if (missingFields.length > 0) {
    const missingFieldsString = missingFields.join(", ");
    const errorMsg = `Missing fields: ${missingFieldsString}`;
    throw new Error(errorMsg);
  }
  if (!data.fileId && !data.data64) {
    throw new Error("No data or file was submitted");
  }
  // Use "default" if user hasn't specified an identifer
  const service = data.service;
  const registeredName = await getNameInfo();
  const name = registeredName;
  let identifier = data.identifier;
  let data64 = data.data64;
  const filename = data.filename;
  const title = data.title;
  const description = data.description;
  const category = data.category;
  const tag1 = data.tag1;
  const tag2 = data.tag2;
  const tag3 = data.tag3;
  const tag4 = data.tag4;
  const tag5 = data.tag5;
  if (data.identifier == null) {
    identifier = "default";
  }
  if (
    data.encrypt &&
    (!data.publicKeys ||
      (Array.isArray(data.publicKeys) && data.publicKeys.length === 0))
  ) {
    throw new Error("Encrypting data requires public keys");
  }
  if (!data.encrypt && data.service.endsWith("_PRIVATE")) {
    throw new Error("Only encrypted data can go into private services");
  }
  if (data.fileId) {
    data64 = await getFileFromContentScript(data.fileId, sender);
  }
  if (data.encrypt) {
    try {
        const resKeyPair = await getKeyPair()
        const parsedData = JSON.parse(resKeyPair)
        const privateKey = parsedData.privateKey
        const userPublicKey = parsedData.publicKey
      const encryptDataResponse = encryptDataGroup({
        data64,
        publicKeys: data.publicKeys,
        privateKey,
        userPublicKey
      });
      if (encryptDataResponse) {
        data64 = encryptDataResponse;
      }
    } catch (error) {
      throw new Error(
        error.message || "Upload failed due to failed encryption"
      );
    }
  }

  const fee = await getFee("ARBITRARY");

  const resPermission = await getUserPermission({
    text1: "Do you give this application permission to publish to QDN?",
    text2: `service: ${service}`,
    text3: `identifier: ${identifier || null}`,
    highlightedText: `isEncrypted: ${!!data.encrypt}`,
    fee: fee.fee,
  }, isFromExtension);
  const { accepted } = resPermission;
  if (accepted) {
    if (data.fileId && !data.encrypt) {
      data64 = await getFileFromContentScript(data.fileId, sender);
    }
    try {
      const resPublish = await publishData({
        registeredName: encodeURIComponent(name),
        file: data64,
        service: service,
        identifier: encodeURIComponent(identifier),
        uploadType: "file",
        isBase64: true,
        filename: filename,
        title,
        description,
        category,
        tag1,
        tag2,
        tag3,
        tag4,
        tag5,
        apiVersion: 2,
        withFee: true,
      });
      return resPublish;
    } catch (error) {
      throw new Error(error?.message || "Upload failed");
    }
  } else {
    throw new Error("User declined request");
  }
};

export const publishMultipleQDNResources = async (data: any, sender, isFromExtension) => {
  const requiredFields = ["resources"];
  const missingFields: string[] = [];
  let feeAmount = null;
  requiredFields.forEach((field) => {
    if (!data[field]) {
      missingFields.push(field);
    }
  });
  if (missingFields.length > 0) {
    const missingFieldsString = missingFields.join(", ");
    const errorMsg = `Missing fields: ${missingFieldsString}`;
    throw new Error(errorMsg);
  }
  const resources = data.resources;
  if (!Array.isArray(resources)) {
    throw new Error("Invalid data");
  }
  if (resources.length === 0) {
    throw new Error("No resources to publish");
  }
  if (
    data.encrypt &&
    (!data.publicKeys ||
      (Array.isArray(data.publicKeys) && data.publicKeys.length === 0))
  ) {
    throw new Error("Encrypting data requires public keys");
  }
  const fee = await getFee("ARBITRARY");
  const registeredName = await getNameInfo();
  const name = registeredName;
  const resPermission = await getUserPermission({
    text1: "Do you give this application permission to publish to QDN?",
    html: `
    <div style="max-height: 30vh; overflow-y: auto;">
    <style>
      body {
        background-color: #121212;
        color: #e0e0e0;
      }
  
      .resource-container {
        display: flex;
        flex-direction: column;
        border: 1px solid #444;
        padding: 16px;
        margin: 8px 0;
        border-radius: 8px;
        background-color: #1e1e1e;
      }
      
      .resource-detail {
        margin-bottom: 8px;
      }
      
      .resource-detail span {
        font-weight: bold;
        color: #bb86fc;
      }
  
      @media (min-width: 600px) {
        .resource-container {
          flex-direction: row;
          flex-wrap: wrap;
        }
        .resource-detail {
          flex: 1 1 45%;
          margin-bottom: 0;
          padding: 4px 0;
        }
      }
    </style>
  
    ${data.resources
      .map(
        (resource) => `
        <div class="resource-container">
          <div class="resource-detail"><span>Service:</span> ${
            resource.service
          }</div>
          <div class="resource-detail"><span>Name:</span> ${resource.name}</div>
          <div class="resource-detail"><span>Identifier:</span> ${
            resource.identifier
          }</div>
          ${
            resource.filename
              ? `<div class="resource-detail"><span>Filename:</span> ${resource.filename}</div>`
              : ""
          }
        </div>`
      )
      .join("")}
  </div>
  
      `,
    highlightedText: `isEncrypted: ${!!data.encrypt}`,
    fee: fee.fee * resources.length,
  }, isFromExtension);
  const { accepted } = resPermission;
  if (!accepted) {
    throw new Error("User declined request");
  }
  let failedPublishesIdentifiers = [];
  for (const resource of resources) {
    try {
      const requiredFields = ["service"];
      const missingFields: string[] = [];
      requiredFields.forEach((field) => {
        if (!resource[field]) {
          missingFields.push(field);
        }
      });
      if (missingFields.length > 0) {
        const missingFieldsString = missingFields.join(", ");
        const errorMsg = `Missing fields: ${missingFieldsString}`;
        failedPublishesIdentifiers.push({
          reason: errorMsg,
          identifier: resource.identifier,
        });
        continue;
      }
      if (!resource.fileId && !resource.data64) {
        const errorMsg = "No data or file was submitted";
        failedPublishesIdentifiers.push({
          reason: errorMsg,
          identifier: resource.identifier,
        });
        continue;
      }
      const service = resource.service;
      let identifier = resource.identifier;
      let data64 = resource.data64;
      const filename = resource.filename;
      const title = resource.title;
      const description = resource.description;
      const category = resource.category;
      const tag1 = resource.tag1;
      const tag2 = resource.tag2;
      const tag3 = resource.tag3;
      const tag4 = resource.tag4;
      const tag5 = resource.tag5;
      if (resource.identifier == null) {
        identifier = "default";
      }
      if (!data.encrypt && service.endsWith("_PRIVATE")) {
        const errorMsg = "Only encrypted data can go into private services";
        failedPublishesIdentifiers.push({
          reason: errorMsg,
          identifier: resource.identifier,
        });
        continue;
      }
      if (resource.fileId) {
        data64 = await getFileFromContentScript(resource.fileId, sender);
      }
      if (data.encrypt) {
        try {
            const resKeyPair = await getKeyPair()
        const parsedData = JSON.parse(resKeyPair)
        const privateKey = parsedData.privateKey
        const userPublicKey = parsedData.publicKey
          const encryptDataResponse = encryptDataGroup({
            data64,
            publicKeys: data.publicKeys,
            privateKey,
            userPublicKey
          });
          if (encryptDataResponse) {
            data64 = encryptDataResponse;
          }
        } catch (error) {
          const errorMsg =
            error?.message || "Upload failed due to failed encryption";
          failedPublishesIdentifiers.push({
            reason: errorMsg,
            identifier: resource.identifier,
          });
          continue;
        }
      }

      try {
        await publishData({
          registeredName: encodeURIComponent(name),
          file: data64,
          service: service,
          identifier: encodeURIComponent(identifier),
          uploadType: "file",
          isBase64: true,
          filename: filename,
          title,
          description,
          category,
          tag1,
          tag2,
          tag3,
          tag4,
          tag5,
          apiVersion: 2,
          withFee: true,
        });
        await new Promise((res) => {
          setTimeout(() => {
            res();
          }, 1000);
        });
      } catch (error) {
        const errorMsg = error.message || "Upload failed";
        failedPublishesIdentifiers.push({
          reason: errorMsg,
          identifier: resource.identifier,
        });
      }
    } catch (error) {
      failedPublishesIdentifiers.push({
        reason: "Unknown error",
        identifier: resource.identifier,
      });
    }
  }
  if (failedPublishesIdentifiers.length > 0) {
    const obj = {};
    obj["error"] = {
      unsuccessfulPublishes: failedPublishesIdentifiers,
    };
    return obj;
  }
  return true;
};

export const voteOnPoll = async (data, isFromExtension) => {
  const requiredFields = ["pollName", "optionIndex"];
  const missingFields: string[] = [];
  requiredFields.forEach((field) => {
    if (!data[field] && data[field] !== 0) {
      missingFields.push(field);
    }
  });
  if (missingFields.length > 0) {
    const missingFieldsString = missingFields.join(", ");
    const errorMsg = `Missing fields: ${missingFieldsString}`;
    throw new Error(errorMsg);
  }
  const pollName = data.pollName;
  const optionIndex = data.optionIndex;
  let pollInfo = null;
  try {
    const url = await createEndpoint(`/polls/${encodeURIComponent(pollName)}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch poll");

    pollInfo = await response.json();
  } catch (error) {
    const errorMsg = (error && error.message) || "Poll not found";
    throw new Error(errorMsg);
  }
  if (!pollInfo || pollInfo.error) {
    const errorMsg = (pollInfo && pollInfo.message) || "Poll not found";
    throw new Error(errorMsg);
  }
  try {
    const optionName = pollInfo.pollOptions[optionIndex].optionName;
    const resVoteOnPoll = await _voteOnPoll({pollName, optionIndex, optionName}, isFromExtension);
    return resVoteOnPoll;
  } catch (error) {
    throw new Error(error?.message || "Failed to vote on the poll.");
  }
};

export const createPoll = async (data, isFromExtension) => {
  const requiredFields = [
    "pollName",
    "pollDescription",
    "pollOptions",
    "pollOwnerAddress",
  ];
  const missingFields: string[] = [];
  requiredFields.forEach((field) => {
    if (!data[field]) {
      missingFields.push(field);
    }
  });
  if (missingFields.length > 0) {
    const missingFieldsString = missingFields.join(", ");
    const errorMsg = `Missing fields: ${missingFieldsString}`;
    throw new Error(errorMsg);
  }
  const pollName = data.pollName;
  const pollDescription = data.pollDescription;
  const pollOptions = data.pollOptions;
  const pollOwnerAddress = data.pollOwnerAddress;
  try {
    const resCreatePoll = await _createPoll(
      {
        pollName,
      pollDescription,
      options: pollOptions,
    },
    isFromExtension
    );
    return resCreatePoll;
  } catch (error) {
    throw new Error(error?.message || "Failed to created poll.");
  }
};

export const sendChatMessage = async (data, isFromExtension) => {
  const message = data.message;
  const recipient = data.destinationAddress;
  const groupId = data.groupId;
  const isRecipient = !groupId;
  const resPermission = await getUserPermission({
    text1: "Do you give this application permission to send this chat message?",
    text2: `To: ${isRecipient ? recipient : `group ${groupId}`}`,
    text3: `${message?.slice(0, 25)}${message?.length > 25 ? "..." : ""}`,
  }, isFromExtension);

  const { accepted } = resPermission;
  if (accepted) {
    const tiptapJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: message,
            },
          ],
        },
      ],
    };
    const messageObject = {
      messageText: tiptapJson,
      images: [""],
      repliedTo: "",
      version: 3,
    };
   
    const stringifyMessageObject = JSON.stringify(messageObject);

    const balance = await getBalanceInfo();
    const hasEnoughBalance = +balance < 4 ? false : true;
    if (!hasEnoughBalance) {
      throw new Error("You need at least 4 QORT to send a message");
    }
    if (isRecipient && recipient) {
      const url = await createEndpoint(`/addresses/publickey/${recipient}`);
      const response = await fetch(url);
      if (!response.ok)
        throw new Error("Failed to fetch recipient's public key");

      let key;
      let hasPublicKey;
      let res;
      const contentType = response.headers.get("content-type");

      // If the response is JSON, parse it as JSON
      if (contentType && contentType.includes("application/json")) {
        res = await response.json();
      } else {
        // Otherwise, treat it as plain text
        res = await response.text();
      }
      if (res?.error === 102) {
        key = "";
        hasPublicKey = false;
      } else if (res !== false) {
        key = res;
        hasPublicKey = true;
      } else {
        key = "";
        hasPublicKey = false;
      }

      if (!hasPublicKey && isRecipient) {
        throw new Error(
          "Cannot send an encrypted message to this user since they do not have their publickey on chain."
        );
      }
      let _reference = new Uint8Array(64);
      self.crypto.getRandomValues(_reference);

      let sendTimestamp = Date.now();

      let reference = Base58.encode(_reference);
      const resKeyPair = await getKeyPair();
      const parsedData = JSON.parse(resKeyPair);
      const uint8PrivateKey = Base58.decode(parsedData.privateKey);
      const uint8PublicKey = Base58.decode(parsedData.publicKey);
      const keyPair = {
        privateKey: uint8PrivateKey,
        publicKey: uint8PublicKey,
      };

      const difficulty = 8;
      const tx = await createTransaction(18, keyPair, {
        timestamp: sendTimestamp,
        recipient: recipient,
        recipientPublicKey: key,
        hasChatReference: 0,
        message: stringifyMessageObject,
        lastReference: reference,
        proofOfWorkNonce: 0,
        isEncrypted: 1,
        isText: 1,
      });
      const path = chrome.runtime.getURL("memory-pow.wasm.full");

      const { nonce, chatBytesArray } = await computePow({
        chatBytes: tx.chatBytes,
        path,
        difficulty,
      });

      let _response = await signChatFunc(chatBytesArray, nonce, null, keyPair);
      if (_response?.error) {
        throw new Error(_response?.message);
      }
      return _response;
    } else if (!isRecipient && groupId) {
      let _reference = new Uint8Array(64);
      self.crypto.getRandomValues(_reference);

      let reference = Base58.encode(_reference);
      const resKeyPair = await getKeyPair();
      const parsedData = JSON.parse(resKeyPair);
      const uint8PrivateKey = Base58.decode(parsedData.privateKey);
      const uint8PublicKey = Base58.decode(parsedData.publicKey);
      const keyPair = {
        privateKey: uint8PrivateKey,
        publicKey: uint8PublicKey,
      };

      const difficulty = 8;

      const txBody = {
        timestamp: Date.now(),
        groupID: Number(groupId),
        hasReceipient: 0,
        hasChatReference: 0,
        message: stringifyMessageObject,
        lastReference: reference,
        proofOfWorkNonce: 0,
        isEncrypted: 0, // Set default to not encrypted for groups
        isText: 1,
      };

      const tx = await createTransaction(181, keyPair, txBody);

      // if (!hasEnoughBalance) {
      //   throw new Error("Must have at least 4 QORT to send a chat message");
      // }
      const path = chrome.runtime.getURL("memory-pow.wasm.full");

      const { nonce, chatBytesArray } = await computePow({
        chatBytes: tx.chatBytes,
        path,
        difficulty,
      });
      let _response = await signChatFunc(chatBytesArray, nonce, null, keyPair);
      if (_response?.error) {
        throw new Error(_response?.message);
      }
      return _response;
    } else {
      throw new Error("Please enter a recipient or groupId");
    }
  } else {
    throw new Error("User declined to send message");
  }
};

export const joinGroup = async (data, isFromExtension) => {
  const requiredFields = ["groupId"];
  const missingFields: string[] = [];
  requiredFields.forEach((field) => {
    if (!data[field]) {
      missingFields.push(field);
    }
  });
  if (missingFields.length > 0) {
    const missingFieldsString = missingFields.join(", ");
    const errorMsg = `Missing fields: ${missingFieldsString}`;
    throw new Error(errorMsg);
  }
  let groupInfo = null;
  try {
    const url = await createEndpoint(`/groups/${data.groupId}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch group");

    groupInfo = await response.json();
  } catch (error) {
    const errorMsg = (error && error.message) || "Group not found";
    throw new Error(errorMsg);
  }
  const fee = await getFee("JOIN_GROUP");

  const resPermission = await getUserPermission({
    text1: "Confirm joining the group:",
    highlightedText: `${groupInfo.groupName}`,
    fee: fee.fee,
  }, isFromExtension);
  const { accepted } = resPermission;

  if (accepted) {
    const groupId = data.groupId;

    if (!groupInfo || groupInfo.error) {
      const errorMsg = (groupInfo && groupInfo.message) || "Group not found";
      throw new Error(errorMsg);
    }
    try {
      const resJoinGroup = await joinGroupFunc({ groupId });
      return resJoinGroup;
    } catch (error) {
      throw new Error(error?.message || "Failed to join the group.");
    }
  } else {
    throw new Error("User declined to join group");
  }
};

export const saveFile = async (data, sender, isFromExtension) => {
  try {
    const requiredFields = ["filename", "fileId"];
    const missingFields: string[] = [];
    requiredFields.forEach((field) => {
      if (!data[field]) {
        missingFields.push(field);
      }
    });
    if (missingFields.length > 0) {
      const missingFieldsString = missingFields.join(", ");
      const errorMsg = `Missing fields: ${missingFieldsString}`;
      throw new Error(errorMsg);
    }
    const filename = data.filename;
    const blob = data.blob;
    const fileId = data.fileId;
    const resPermission = await getUserPermission({
      text1: "Would you like to download:",
      highlightedText: `${filename}`,
    }, isFromExtension);
    const { accepted } = resPermission;

    if (accepted) {
      const mimeType = blob.type || data.mimeType;
      let backupExention = filename.split(".").pop();
      if (backupExention) {
        backupExention = "." + backupExention;
      }
      const fileExtension = mimeToExtensionMap[mimeType] || backupExention;
      let fileHandleOptions = {};
      if (!mimeType) {
        throw new Error("A mimeType could not be derived");
      }
      if (!fileExtension) {
        const obj = {};
        throw new Error("A file extension could not be derived");
      }
      if (fileExtension && mimeType) {
        fileHandleOptions = {
          accept: {
            [mimeType]: [fileExtension],
          },
        };
      }
      sendToSaveFilePicker(
        {
          filename,
          mimeType,
          blob,
          fileId,
          fileHandleOptions,
        },
        sender
      );
      return true;
    } else {
      throw new Error("User declined to save file");
    }
  } catch (error) {
    throw new Error(error?.message || "Failed to initiate download");
  }
};

export const deployAt = async (data, isFromExtension) => {
  const requiredFields = [
    "name",
    "description",
    "tags",
    "creationBytes",
    "amount",
    "assetId",
    "type",
  ];
  const missingFields: string[] = [];
  requiredFields.forEach((field) => {
    if (!data[field] && data[field] !== 0) {
      missingFields.push(field);
    }
  });
  if (missingFields.length > 0) {
    const missingFieldsString = missingFields.join(", ");
    const errorMsg = `Missing fields: ${missingFieldsString}`;
    throw new Error(errorMsg);
  }
  try {
    const resDeployAt = await _deployAt(
      {
       name: data.name,
     description: data.description,
     tags: data.tags,
     creationBytes: data.creationBytes,
      amount: data.amount,
     assetId: data.assetId,
     atType: data.type
    },
    isFromExtension
    );
    return resDeployAt;
  } catch (error) {
    throw new Error(error?.message || "Failed to join the group.");
  }
};

export const getUserWallet = async (data, isFromExtension) => {
  const requiredFields = ["coin"];
  const missingFields: string[] = [];
  requiredFields.forEach((field) => {
    if (!data[field]) {
      missingFields.push(field);
    }
  });
  if (missingFields.length > 0) {
    const missingFieldsString = missingFields.join(", ");
    const errorMsg = `Missing fields: ${missingFieldsString}`;
    throw new Error(errorMsg);
  }
  const resPermission = await getUserPermission({
    text1:
      "Do you give this application permission to get your wallet information?",
  }, isFromExtension);
  const { accepted } = resPermission;

  if (accepted) {
    let coin = data.coin;
    let userWallet = {};
    let arrrAddress = "";
    const wallet = await getSaveWallet();
    const address = wallet.address0;
    const resKeyPair = await getKeyPair();
    const parsedData = JSON.parse(resKeyPair);
    const arrrSeed58 = parsedData.arrrSeed58;
    if (coin === "ARRR") {
      const bodyToString = arrrSeed58;
      const url = await createEndpoint(`/crosschain/arrr/walletaddress`);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: bodyToString,
      });
      let res;
      try {
        res = await response.clone().json();
      } catch (e) {
        res = await response.text();
      }
      if (res?.error && res?.message) {
        throw new Error(res.message);
      }
      arrrAddress = res;
    }
    switch (coin) {
      case "QORT":
        userWallet["address"] = address;
        userWallet["publickey"] = parsedData.publicKey;
        break;
      case "BTC":
        userWallet["address"] = parsedData.btcAddress;
        userWallet["publickey"] = parsedData.derivedMasterPublicKey;
        break;
      case "LTC":
        userWallet["address"] = parsedData.ltcAddress;
        userWallet["publickey"] = parsedData.ltcPublicKey;
        break;
      case "DOGE":
        userWallet["address"] = parsedData.dogeAddress;
        userWallet["publickey"] = parsedData.dogePublicKey;
        break;
      case "DGB":
        userWallet["address"] = parsedData.dgbAddress;
        userWallet["publickey"] = parsedData.dgbPublicKey;
        break;
      case "RVN":
        userWallet["address"] = parsedData.rvnAddress;
        userWallet["publickey"] = parsedData.rvnPublicKey;
        break;
      case "ARRR":
        userWallet["address"] = arrrAddress;
        break;
      default:
        break;
    }
    return userWallet;
  } else {
    throw new Error("User declined request");
  }
};

export const getWalletBalance = async (data, bypassPermission?: boolean, isFromExtension) => {
  const requiredFields = ["coin"];
  const missingFields: string[] = [];
  requiredFields.forEach((field) => {
    if (!data[field]) {
      missingFields.push(field);
    }
  });
  if (missingFields.length > 0) {
    const missingFieldsString = missingFields.join(", ");
    const errorMsg = `Missing fields: ${missingFieldsString}`;
    throw new Error(errorMsg);
  }
  let resPermission

  if(!bypassPermission){
     resPermission = await getUserPermission({
        text1: "Do you give this application permission to fetch your",
        highlightedText: `${data.coin} balance`,
      }, isFromExtension);
  } else {
    resPermission = {
        accepted: false
    }
  }
 
  const { accepted } = resPermission;

  if (accepted || bypassPermission) {
    let coin = data.coin;
    const wallet = await getSaveWallet();
    const address = wallet.address0;
    const resKeyPair = await getKeyPair();
    const parsedData = JSON.parse(resKeyPair);
    if (coin === "QORT") {
      let qortAddress = address;
      try {
        const url = await createEndpoint(`/addresses/balance/${qortAddress}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch");
        let res;
        try {
          res = await response.clone().json();
        } catch (e) {
          res = await response.text();
        }
        return res;
      } catch (error) {
        throw new Error(
          error?.message || "Fetch Wallet Failed. Please try again"
        );
      }
    } else {
      let _url = ``;
      let _body = null;
      switch (coin) {
        case "BTC":
          _url = await createEndpoint(`/crosschain/btc/walletbalance`);

          _body = parsedData.derivedMasterPublicKey;
          break;
        case "LTC":
          _url = await createEndpoint(`/crosschain/ltc/walletbalance`);
          _body = parsedData.ltcPublicKey;
          break;
        case "DOGE":
          _url = await createEndpoint(`/crosschain/doge/walletbalance`);
          _body = parsedData.dogePublicKey;
          break;
        case "DGB":
          _url = await createEndpoint(`/crosschain/dgb/walletbalance`);
          _body = parsedData.dgbPublicKey;
          break;
        case "RVN":
          _url = await createEndpoint(`/crosschain/rvn/walletbalance`);
          _body = parsedData.rvnPublicKey;
          break;
        case "ARRR":
          _url = await createEndpoint(`/crosschain/arrr/walletbalance`);
          _body = parsedData.arrrSeed58;
          break;
        default:
          break;
      }
      try {
        const response = await fetch(_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: _body,
        });
        let res;
        try {
          res = await response.clone().json();
        } catch (e) {
          res = await response.text();
        }
        if (res?.error && res?.message) {
          throw new Error(res.message);
        }
        if (isNaN(Number(res))) {
          throw new Error("Unable to fetch balance");
        } else {
          return (Number(res) / 1e8).toFixed(8);
        }
      } catch (error) {
        throw new Error(error?.message || "Unable to fetch balance");
      }
    }
  } else {
    throw new Error("User declined request");
  }
};

const getUserWalletFunc = async (coin) => {
  let userWallet = {};
  const wallet = await getSaveWallet();
  const address = wallet.address0;
  const resKeyPair = await getKeyPair();
  const parsedData = JSON.parse(resKeyPair);
  switch (coin) {
    case "QORT":
      userWallet["address"] = address;
      userWallet["publickey"] = parsedData.publicKey;
      break;
    case "BTC":
      userWallet["address"] = parsedData.btcAddress;
      userWallet["publickey"] = parsedData.btcPublicKey;
      break;
    case "LTC":
      userWallet["address"] = parsedData.ltcAddress;
      userWallet["publickey"] = parsedData.ltcPublicKey;
      break;
    case "DOGE":
      userWallet["address"] = parsedData.dogeAddress;
      userWallet["publickey"] = parsedData.dogePublicKey;
      break;
    case "DGB":
      userWallet["address"] = parsedData.dgbAddress;
      userWallet["publickey"] = parsedData.dgbPublicKey;
      break;
    case "RVN":
      userWallet["address"] = parsedData.rvnAddress;
      userWallet["publickey"] = parsedData.rvnPublicKey;
      break;
    case "ARRR":
      break;
    default:
      break;
  }
  return userWallet;
};

export const getUserWalletInfo = async (data, isFromExtension) => {
  const requiredFields = ["coin"];
  const missingFields: string[] = [];
  requiredFields.forEach((field) => {
    if (!data[field]) {
      missingFields.push(field);
    }
  });
  if (missingFields.length > 0) {
    const missingFieldsString = missingFields.join(", ");
    const errorMsg = `Missing fields: ${missingFieldsString}`;
    throw new Error(errorMsg);
  }
  const resPermission = await getUserPermission({
    text1: "Do you give this application permission to retrieve your wallet information",
  }, isFromExtension);
  const { accepted } = resPermission;

  if (accepted) {
    let coin = data.coin;
    let walletKeys = await getUserWalletFunc(coin);
    const _url = await createEndpoint(
      `/crosschain/` + data.coin.toLowerCase() + `/addressinfos`
    );
    let _body = { xpub58: walletKeys["publickey"] };
    try {
      const response = await fetch(_url, {
        method: "POST",
        headers: {
          Accept: "*/*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(_body),
      });
      if(!response?.ok) throw new Error('Unable to fetch wallet information')
      let res;
      try {
        res = await response.clone().json();
      } catch (e) {
        res = await response.text();
      }
      if (res?.error && res?.message) {
        throw new Error(res.message);
      }

      return res;
    } catch (error) {
      throw new Error(error?.message || "Fetch Wallet Failed");
    }
  } else {
    throw new Error("User declined request");
  }
};

export const getCrossChainServerInfo = async (data)=> {
    const requiredFields = ['coin']
					const missingFields: string[] = []
					requiredFields.forEach((field) => {
						if (!data[field]) {
							missingFields.push(field)
						}
					})
					if (missingFields.length > 0) {
						const missingFieldsString = missingFields.join(', ')
						const errorMsg = `Missing fields: ${missingFieldsString}`
						throw new Error(errorMsg)
					}
					let _url = `/crosschain/` + data.coin.toLowerCase() + `/serverinfos`
					try {
					
					
                        const url = await createEndpoint(_url);
                        const response = await fetch(url);
                        if (!response.ok) throw new Error("Failed to fetch");
                        let res;
                        try {
                          res = await response.clone().json();
                        } catch (e) {
                          res = await response.text();
                        }
                        if (res?.error && res?.message) {
                          throw new Error(res.message);
                        }
						return res.servers
					} catch (error) {
						
                        throw new Error(error?.message || 'Error in retrieving server info')
					} 
}

export const getTxActivitySummary = async (data) => {
    const requiredFields = ['coin'];
    const missingFields: string[] = [];
    requiredFields.forEach((field) => {
      if (!data[field]) {
        missingFields.push(field);
      }
    });
  
    if (missingFields.length > 0) {
      const missingFieldsString = missingFields.join(', ');
      const errorMsg = `Missing fields: ${missingFieldsString}`;
      throw new Error(errorMsg);
    }
  
    const coin = data.coin;
    const url = `/crosschain/txactivity?foreignBlockchain=${coin}`; // No apiKey here
  
    try {
      const endpoint = await createEndpoint(url);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
        },
      });
  
      if (!response.ok) throw new Error('Failed to fetch');
      let res;
      try {
        res = await response.clone().json();
      } catch (e) {
        res = await response.text();
      }
      if (res?.error && res?.message) {
        throw new Error(res.message);
      }
      return res; // Return full response here
    } catch (error) {
      throw new Error(error?.message || 'Error in tx activity summary');
    }
  };

  export const getForeignFee = async (data) => {
    const requiredFields = ['coin', 'type'];
    const missingFields: string[] = [];
  
    requiredFields.forEach((field) => {
      if (!data[field]) {
        missingFields.push(field);
      }
    });
  
    if (missingFields.length > 0) {
      const missingFieldsString = missingFields.join(', ');
      const errorMsg = `Missing fields: ${missingFieldsString}`;
      throw new Error(errorMsg);
    }
  
    const { coin, type } = data;
    const url = `/crosschain/${coin}/${type}`;
  
    try {
      const endpoint = await createEndpoint(url);
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
        },
      });
  
      if (!response.ok) throw new Error('Failed to fetch');
      let res;
      try {
        res = await response.clone().json();
      } catch (e) {
        res = await response.text();
      }
      if (res?.error && res?.message) {
        throw new Error(res.message);
      }
      return res; // Return full response here
    } catch (error) {
      throw new Error(error?.message || 'Error in get foreign fee');
    }
  };

  export const updateForeignFee = async (data) => {
    const localNodeAvailable = await isUsingLocal()
    if(!localNodeAvailable) throw new Error('Please use your local node.')
    const requiredFields = ['coin', 'type', 'value'];
    const missingFields: string[] = [];
  
    requiredFields.forEach((field) => {
      if (!data[field]) {
        missingFields.push(field);
      }
    });
  
    if (missingFields.length > 0) {
      const missingFieldsString = missingFields.join(', ');
      const errorMsg = `Missing fields: ${missingFieldsString}`;
      throw new Error(errorMsg);
    }
  
    const { coin, type, value } = data;
    const url = `/crosschain/${coin}/update${type}`;
  
    try {
      const endpoint = await createEndpoint(url);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value }),
      });
  
      if (!response.ok) throw new Error('Failed to update foreign fee');
      let res;
      try {
        res = await response.clone().json();
      } catch (e) {
        res = await response.text();
      }
      if (res?.error && res?.message) {
        throw new Error(res.message);
      }
      return res; // Return full response here
    } catch (error) {
      throw new Error(error?.message || 'Error in update foreign fee');
    }
  };
  
  export const getServerConnectionHistory = async (data) => {
    const requiredFields = ['coin'];
    const missingFields: string[] = [];
  
    // Validate required fields
    requiredFields.forEach((field) => {
      if (!data[field]) {
        missingFields.push(field);
      }
    });
  
    if (missingFields.length > 0) {
      const missingFieldsString = missingFields.join(', ');
      const errorMsg = `Missing fields: ${missingFieldsString}`;
      throw new Error(errorMsg);
    }
  
    const coin = data.coin.toLowerCase();
    const url = `/crosschain/${coin}/serverconnectionhistory`;
  
    try {
      const endpoint = await createEndpoint(url); // Assuming createEndpoint is available
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
        },
      });
  
      if (!response.ok) throw new Error('Failed to fetch server connection history');
      
      let res;
      try {
        res = await response.clone().json();
      } catch (e) {
        res = await response.text();
      }
  
      if (res?.error && res?.message) {
        throw new Error(res.message);
      }
  
      return res; // Return full response here
    } catch (error) {
      throw new Error(error?.message || 'Error in get server connection history');
    }
  };

  export const setCurrentForeignServer = async (data) => {
    const localNodeAvailable = await isUsingLocal()
    if(!localNodeAvailable) throw new Error('Please use your local node.')
    const requiredFields = ['coin'];
    const missingFields: string[] = [];
  
    // Validate required fields
    requiredFields.forEach((field) => {
      if (!data[field]) {
        missingFields.push(field);
      }
    });
  
    if (missingFields.length > 0) {
      const missingFieldsString = missingFields.join(', ');
      const errorMsg = `Missing fields: ${missingFieldsString}`;
      throw new Error(errorMsg);
    }
  
    const { coin, host, port, type } = data;
    const body = {
      hostName: host,
      port: port,
      connectionType: type,
    };
  
    const url = `/crosschain/${coin}/setcurrentserver`;
  
    try {
      const endpoint = await createEndpoint(url); // Assuming createEndpoint is available
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
  
      if (!response.ok) throw new Error('Failed to set current server');
      
      let res;
      try {
        res = await response.clone().json();
      } catch (e) {
        res = await response.text();
      }
  
      if (res?.error && res?.message) {
        throw new Error(res.message);
      }
  
      return res; // Return the full response
    } catch (error) {
      throw new Error(error?.message || 'Error in set current server');
    }
  };
  

  export const addForeignServer = async (data) => {
    const localNodeAvailable = await isUsingLocal()
    if(!localNodeAvailable) throw new Error('Please use your local node.')
    const requiredFields = ['coin'];
    const missingFields: string[] = [];
  
    // Validate required fields
    requiredFields.forEach((field) => {
      if (!data[field]) {
        missingFields.push(field);
      }
    });
  
    if (missingFields.length > 0) {
      const missingFieldsString = missingFields.join(', ');
      const errorMsg = `Missing fields: ${missingFieldsString}`;
      throw new Error(errorMsg);
    }
  
    const { coin, host, port, type } = data;
    const body = {
      hostName: host,
      port: port,
      connectionType: type,
    };
  
    const url = `/crosschain/${coin}/addserver`;
  
    try {
      const endpoint = await createEndpoint(url); // Assuming createEndpoint is available
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
  
      if (!response.ok) throw new Error('Failed to add server');
      
      let res;
      try {
        res = await response.clone().json();
      } catch (e) {
        res = await response.text();
      }
  
      if (res?.error && res?.message) {
        throw new Error(res.message);
      }
  
      return res; // Return the full response
    } catch (error) {
      throw new Error(error.message || 'Error in adding server');
    }
  };
  
  export const removeForeignServer = async (data) => {
    const localNodeAvailable = await isUsingLocal()
    if(!localNodeAvailable) throw new Error('Please use your local node.')
    const requiredFields = ['coin'];
    const missingFields: string[] = [];
  
    // Validate required fields
    requiredFields.forEach((field) => {
      if (!data[field]) {
        missingFields.push(field);
      }
    });
  
    if (missingFields.length > 0) {
      const missingFieldsString = missingFields.join(', ');
      const errorMsg = `Missing fields: ${missingFieldsString}`;
      throw new Error(errorMsg);
    }
  
    const { coin, host, port, type } = data;
    const body = {
      hostName: host,
      port: port,
      connectionType: type,
    };
  
    const url = `/crosschain/${coin}/removeserver`;
  
    try {
      const endpoint = await createEndpoint(url); // Assuming createEndpoint is available
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
  
      if (!response.ok) throw new Error('Failed to remove server');
      
      let res;
      try {
        res = await response.clone().json();
      } catch (e) {
        res = await response.text();
      }
  
      if (res?.error && res?.message) {
        throw new Error(res.message);
      }
  
      return res; // Return the full response
    } catch (error) {
      throw new Error(error?.message || 'Error in removing server');
    }
  };
  
  export const getDaySummary = async () => {
    const url = `/admin/summary`; // Simplified endpoint URL
  
    try {
      const endpoint = await createEndpoint(url); // Assuming createEndpoint is available for constructing the full URL
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: '*/*',
        },
      });
  
      if (!response.ok) throw new Error('Failed to retrieve summary');
  
      let res;
      try {
        res = await response.clone().json();
      } catch (e) {
        res = await response.text();
      }
  
      if (res?.error && res?.message) {
        throw new Error(res.message);
      }
  
      return res; // Return the full response
    } catch (error) {
      throw new Error(error?.message || 'Error in retrieving summary');
    }
  };
  
export const sendCoin = async (data, isFromExtension) => {
    const requiredFields = ['coin', 'destinationAddress', 'amount']
    const missingFields: string[] = []
    requiredFields.forEach((field) => {
        if (!data[field]) {
            missingFields.push(field)
        }
    })
    if (missingFields.length > 0) {
        const missingFieldsString = missingFields.join(', ')
        const errorMsg = `Missing fields: ${missingFieldsString}`
        throw new Error(errorMsg)
    }
    let checkCoin = data.coin
    const wallet = await getSaveWallet();
    const address = wallet.address0;
    const resKeyPair = await getKeyPair();
    const parsedData = JSON.parse(resKeyPair);
    const localNodeAvailable = await isUsingLocal()
    if(checkCoin !== 'QORT' && !localNodeAvailable) throw new Error('Cannot send a non-QORT coin through the gateway. Please use your local node.')
    if (checkCoin === "QORT") {
        // Params: data.coin, data.destinationAddress, data.amount, data.fee
        // TODO: prompt user to send. If they confirm, call `POST /crosschain/:coin/send`, or for QORT, broadcast a PAYMENT transaction
        // then set the response string from the core to the `response` variable (defined above)
        // If they decline, send back JSON that includes an `error` key, such as `{"error": "User declined request"}`
        const amount = Number(data.amount)
        const recipient = data.destinationAddress
       
        const url = await createEndpoint(`/addresses/balance/${address}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch");
    let walletBalance;
    try {
        walletBalance = await response.clone().json();
    } catch (e) {
        walletBalance = await response.text();
    }
        if (isNaN(Number(walletBalance))) {
            let errorMsg = "Failed to Fetch QORT Balance. Try again!"
           throw new Error(errorMsg)
        }
        
        const transformDecimals = (Number(walletBalance) * QORT_DECIMALS).toFixed(0)
        const walletBalanceDecimals = Number(transformDecimals)
        const amountDecimals = Number(amount) * QORT_DECIMALS
        const fee: number = await sendQortFee()
        if (amountDecimals + (fee * QORT_DECIMALS) > walletBalanceDecimals) {
            let errorMsg = "Insufficient Funds!"
            throw new Error(errorMsg)
        }
        if (amount <= 0) {
            let errorMsg = "Invalid Amount!"
           throw new Error(errorMsg)
        }
        if (recipient.length === 0) {
            let errorMsg = "Receiver cannot be empty!"
            throw new Error(errorMsg)
        }

        const resPermission = await getUserPermission({
            text1: "Do you give this application permission to send coins?",
            text2: `To: ${recipient}`, 
            highlightedText: `${amount} ${checkCoin}`,
          }, isFromExtension);
          const { accepted } = resPermission;
        
          if (accepted) {
            const makePayment = await sendCoinFunc({amount, password: null, receiver: recipient }, true)
            return makePayment.res
          } else {
            throw new Error("User declined request")
          }
      
    } else if (checkCoin === "BTC") {
        const amount = Number(data.amount)
        const recipient = data.destinationAddress
        const xprv58 = parsedData.btcPrivateKey
        const feePerByte = data.fee ? data.fee : btcFeePerByte
        
        const btcWalletBalance = await getWalletBalance({coin: checkCoin}, true)

        if (isNaN(Number(btcWalletBalance))) {
            throw new Error('Unable to fetch BTC balance')
        }
        const btcWalletBalanceDecimals = Number(btcWalletBalance)
        const btcAmountDecimals = Number(amount) * QORT_DECIMALS
        const fee = feePerByte * 500 // default 0.00050000
        if (btcAmountDecimals + (fee * QORT_DECIMALS) > btcWalletBalanceDecimals) {
            throw new Error("INSUFFICIENT_FUNDS")
        }
       
        const resPermission = await getUserPermission({
            text1: "Do you give this application permission to send coins?",
            text2: `To: ${recipient}`, 
            highlightedText: `${amount} ${checkCoin}`,
            fee: fee
          }, isFromExtension);
          const { accepted } = resPermission;
        
          if (accepted) {
            const opts = {
                xprv58: xprv58,
                receivingAddress: recipient,
                bitcoinAmount: amount,
                feePerByte: feePerByte * QORT_DECIMALS
            }
            const url = await createEndpoint(`/crosschain/btc/send`);
            
           const response = await  fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(opts)
            })
            if (!response.ok) throw new Error("Failed to send");
            let res;
            try {
              res = await response.clone().json();
            } catch (e) {
              res = await response.text();
            }
            return res;
         
          } else {
            throw new Error("User declined request")
          }

    } else if (checkCoin === "LTC") {
    
        const amount = Number(data.amount)
        const recipient = data.destinationAddress
        const xprv58 = parsedData.ltcPrivateKey
        const feePerByte = data.fee ? data.fee : ltcFeePerByte
        const ltcWalletBalance = await getWalletBalance({coin: checkCoin}, true)

        if (isNaN(Number(ltcWalletBalance))) {
            let errorMsg = "Failed to Fetch LTC Balance. Try again!"
            throw new Error(errorMsg)
        }
        const ltcWalletBalanceDecimals = Number(ltcWalletBalance)
        const ltcAmountDecimals = Number(amount) * QORT_DECIMALS
        const balance = (Number(ltcWalletBalance) / 1e8).toFixed(8)
        const fee = feePerByte * 1000 // default 0.00030000
        if (ltcAmountDecimals + (fee * QORT_DECIMALS) > ltcWalletBalanceDecimals) {
            throw new Error("Insufficient Funds!")
        }
        const resPermission = await getUserPermission({
            text1: "Do you give this application permission to send coins?",
            text2: `To: ${recipient}`, 
            highlightedText: `${amount} ${checkCoin}`,
            fee: fee
          }, isFromExtension);
          const { accepted } = resPermission;
        
          if (accepted) {
            const url = await createEndpoint(`/crosschain/ltc/send`);
            const opts = {
                xprv58: xprv58,
                receivingAddress: recipient,
                litecoinAmount: amount,
                feePerByte: feePerByte * QORT_DECIMALS
            }
            const response = await  fetch(url, {
                 method: 'POST',
                 headers: {
                     'Accept': 'application/json',
                     'Content-Type': 'application/json'
                 },
                 body: JSON.stringify(opts)
             })
             if (!response.ok) throw new Error("Failed to send");
             let res;
             try {
               res = await response.clone().json();
             } catch (e) {
               res = await response.text();
             }
             return res;
          } else {
            throw new Error("User declined request")
          }
        
    } else if (checkCoin === "DOGE") {
       
        const amount = Number(data.amount)
        const recipient = data.destinationAddress
        const coin = data.coin
        const xprv58 = parsedData.dogePrivateKey
        const feePerByte = data.fee ? data.fee : dogeFeePerByte
        const dogeWalletBalance = await getWalletBalance({coin: checkCoin}, true)
        if (isNaN(Number(dogeWalletBalance))) {
            let errorMsg = "Failed to Fetch DOGE Balance. Try again!"
            throw new Error(errorMsg)
        }
        const dogeWalletBalanceDecimals = Number(dogeWalletBalance)
        const dogeAmountDecimals = Number(amount) * QORT_DECIMALS
        const balance = (Number(dogeWalletBalance) / 1e8).toFixed(8)
        const fee = feePerByte * 5000 // default 0.05000000
        if (dogeAmountDecimals + (fee * QORT_DECIMALS) > dogeWalletBalanceDecimals) {
            let errorMsg = "Insufficient Funds!"
            throw new Error(errorMsg)
        }
        
        const resPermission = await getUserPermission({
            text1: "Do you give this application permission to send coins?",
            text2: `To: ${recipient}`, 
            highlightedText: `${amount} ${checkCoin}`,
            fee: fee
          }, isFromExtension);
          const { accepted } = resPermission;
        
          if (accepted) {
            const opts = {
                xprv58: xprv58,
                receivingAddress: recipient,
                dogecoinAmount: amount,
                feePerByte: feePerByte * QORT_DECIMALS
            }
            const url = await createEndpoint(`/crosschain/doge/send`);
            
            const response = await  fetch(url, {
                 method: 'POST',
                 headers: {
                     'Accept': 'application/json',
                     'Content-Type': 'application/json'
                 },
                 body: JSON.stringify(opts)
             })
             if (!response.ok) throw new Error("Failed to send");
             let res;
             try {
               res = await response.clone().json();
             } catch (e) {
               res = await response.text();
             }
             return res;
          } else {
            throw new Error("User declined request")
          }
        
    } else if (checkCoin === "DGB") {
        const amount = Number(data.amount)
        const recipient = data.destinationAddress
        const xprv58 = parsedData.dbgPrivateKey
        const feePerByte = data.fee ? data.fee : dgbFeePerByte
        const dgbWalletBalance = await getWalletBalance({coin: checkCoin}, true)
        if (isNaN(Number(dgbWalletBalance))) {
            let errorMsg = "Failed to Fetch DGB Balance. Try again!"
            throw new Error(errorMsg)
        }
        const dgbWalletBalanceDecimals = Number(dgbWalletBalance)
        const dgbAmountDecimals = Number(amount) * QORT_DECIMALS
        const fee = feePerByte * 500 // default 0.00005000
        if (dgbAmountDecimals + (fee * QORT_DECIMALS) > dgbWalletBalanceDecimals) {
            let errorMsg = "Insufficient Funds!"
            throw new Error(errorMsg)
        }

        const resPermission = await getUserPermission({
            text1: "Do you give this application permission to send coins?",
            text2: `To: ${recipient}`, 
            highlightedText: `${amount} ${checkCoin}`,
            fee: fee
          }, isFromExtension);
          const { accepted } = resPermission;
        
          if (accepted) {
            const opts = {
                xprv58: xprv58,
                receivingAddress: recipient,
                digibyteAmount: amount,
                feePerByte: feePerByte * QORT_DECIMALS
            }
            const url = await createEndpoint(`/crosschain/dgb/send`);
            
            const response = await  fetch(url, {
                 method: 'POST',
                 headers: {
                     'Accept': 'application/json',
                     'Content-Type': 'application/json'
                 },
                 body: JSON.stringify(opts)
             })
             if (!response.ok) throw new Error("Failed to send");
             let res;
             try {
               res = await response.clone().json();
             } catch (e) {
               res = await response.text();
             }
             return res;
          } else {
            throw new Error("User declined request")
          }
       
    } else if (checkCoin === "RVN") {
        const amount = Number(data.amount)
        const recipient = data.destinationAddress
        const coin = data.coin
        const xprv58 = parsedData.rvnPrivateKey
        const feePerByte = data.fee ? data.fee : rvnFeePerByte
        const rvnWalletBalance = await getWalletBalance({coin: checkCoin}, true)
        if (isNaN(Number(rvnWalletBalance))) {
            let errorMsg = "Failed to Fetch RVN Balance. Try again!"
            throw new Error(errorMsg)
        }
        const rvnWalletBalanceDecimals = Number(rvnWalletBalance)
        const rvnAmountDecimals = Number(amount) * QORT_DECIMALS
        const balance = (Number(rvnWalletBalance) / 1e8).toFixed(8)
        const fee = feePerByte * 500 // default 0.00562500
        if (rvnAmountDecimals + (fee * QORT_DECIMALS) > rvnWalletBalanceDecimals) {
          
            let errorMsg = "Insufficient Funds!"
            throw new Error(errorMsg)
        }
        
        const resPermission = await getUserPermission({
            text1: "Do you give this application permission to send coins?",
            text2: `To: ${recipient}`, 
            highlightedText: `${amount} ${checkCoin}`,
            fee: fee
          }, isFromExtension);
          const { accepted } = resPermission;
        
          if (accepted) {
            const opts = {
                xprv58: xprv58,
                receivingAddress: recipient,
                ravencoinAmount: amount,
                feePerByte: feePerByte * QORT_DECIMALS
            }
            const url = await createEndpoint(`/crosschain/rvn/send`);
            
           const response = await  fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(opts)
            })
            if (!response.ok) throw new Error("Failed to send");
            let res;
            try {
              res = await response.clone().json();
            } catch (e) {
              res = await response.text();
            }
            return res;
          } else {
            throw new Error("User declined request")
          }
    } else if (checkCoin === "ARRR") {
        const amount = Number(data.amount)
        const recipient = data.destinationAddress
        const memo = data.memo
        const arrrWalletBalance = await getWalletBalance({coin: checkCoin}, true)

        if (isNaN(Number(arrrWalletBalance))) {
            let errorMsg = "Failed to Fetch ARRR Balance. Try again!"
            throw new Error(errorMsg)
        }
        const arrrWalletBalanceDecimals = Number(arrrWalletBalance)
        const arrrAmountDecimals = Number(amount) * QORT_DECIMALS
        const fee = 0.00010000
        if (arrrAmountDecimals + (fee * QORT_DECIMALS) > arrrWalletBalanceDecimals) {
            let errorMsg = "Insufficient Funds!"
            throw new Error(errorMsg)
        }
        
        const resPermission = await getUserPermission({
            text1: "Do you give this application permission to send coins?",
            text2: `To: ${recipient}`, 
            highlightedText: `${amount} ${checkCoin}`,
            fee: fee
          }, isFromExtension);
          const { accepted } = resPermission;
        
          if (accepted) {
            const opts = {
                entropy58: parsedData.arrrSeed58,
                receivingAddress: recipient,
                arrrAmount: amount,
                memo: memo
            }
            const url = await createEndpoint(`/crosschain/btc/send`);
            
           const response = await  fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(opts)
            })
            if (!response.ok) throw new Error("Failed to send");
            let res;
            try {
              res = await response.clone().json();
            } catch (e) {
              res = await response.text();
            }
            return res;
          } else {
            throw new Error("User declined request")
          }
    }
};