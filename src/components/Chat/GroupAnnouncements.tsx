import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CreateCommonSecret } from "./CreateCommonSecret";
import { reusableGet } from "../../qdn/publish/pubish";
import { uint8ArrayToObject } from "../../backgroundFunctions/encryption";
import {
  base64ToUint8Array,
  objectToBase64,
} from "../../qdn/encryption/group-encryption";
import { ChatContainerComp } from "./ChatContainer";
import { ChatList } from "./ChatList";
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import Tiptap from "./TipTap";
import { AuthenticatedContainerInnerTop, CustomButton } from "../../App-styles";
import CircularProgress from "@mui/material/CircularProgress";
import { getBaseApi, getFee } from "../../background";
import { LoadingSnackbar } from "../Snackbar/LoadingSnackbar";
import { Box, Typography } from "@mui/material";
import { Spacer } from "../../common/Spacer";
import ShortUniqueId from "short-unique-id";
import { AnnouncementList } from "./AnnouncementList";
const uid = new ShortUniqueId({ length: 8 });
import CampaignIcon from '@mui/icons-material/Campaign';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { AnnouncementDiscussion } from "./AnnouncementDiscussion";
import { MyContext, getBaseApiReact } from "../../App";
import { RequestQueueWithPromise } from "../../utils/queue/queue";
import { CustomizedSnackbars } from "../Snackbar/Snackbar";

export const requestQueueCommentCount = new RequestQueueWithPromise(3)
export const requestQueuePublishedAccouncements = new RequestQueueWithPromise(3)

export const saveTempPublish = async ({ data, key }: any) => {
   
      
  return new Promise((res, rej) => {
    chrome.runtime.sendMessage(
      {
        action: "saveTempPublish",
        payload: {
          data,
          key,
        },
      },
      (response) => {
      
        if (!response?.error) {
          res(response);
        }
        rej(response.error);
      }
    );
  });
};

export const getTempPublish = async () => {
   
      
  return new Promise((res, rej) => {
    chrome.runtime.sendMessage(
      {
        action: "getTempPublish",
        payload: {
        },
      },
      (response) => {
        if (!response?.error) {
          res(response);
        }
        rej(response.error);
      }
    );
  });
};

export const decryptPublishes = async (encryptedMessages: any[], secretKey) => {
  try {
    return await new Promise((res, rej) => {
      chrome.runtime.sendMessage(
        {
          action: "decryptSingleForPublishes",
          payload: {
            data: encryptedMessages,
            secretKeyObject: secretKey,
            skipDecodeBase64: true,
          },
        },
        (response) => {
     
          if (!response?.error) {
            res(response);
            // if(hasInitialized.current){

            //   setMessages((prev)=> [...prev, ...formatted])
            // } else {
            //   const formatted = response.map((item: any)=> {
            //     return {
            //       ...item,
            //       id: item.signature,
            //       text: item.text,
            //       unread: false
            //     }
            //   } )
            //   setMessages(formatted)
            //   hasInitialized.current = true

            // }
          }
          rej(response.error);
        }
      );
    });
  } catch (error) {}
};
export const GroupAnnouncements = ({
  selectedGroup,
  secretKey,
  setSecretKey,
  getSecretKey,
  myAddress,
  handleNewEncryptionNotification,
  isAdmin,
  hide,
  myName
}) => {
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);
  const [tempPublishedList, setTempPublishedList] = useState([])
  const [announcementData, setAnnouncementData] = useState({});
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const { show } = React.useContext(MyContext);
  const [openSnack, setOpenSnack] = React.useState(false);
  const [infoSnack, setInfoSnack] = React.useState(null);
  const hasInitialized = useRef(false);
  const hasInitializedWebsocket = useRef(false);
  const editorRef = useRef(null);

  const setEditorRef = (editorInstance) => {
    editorRef.current = editorInstance;
  };

  const getAnnouncementData = async ({ identifier, name }) => {
    try {
   
      const res = await requestQueuePublishedAccouncements.enqueue(()=> {
        return fetch(
          `${getBaseApiReact()}/arbitrary/DOCUMENT/${name}/${identifier}?encoding=base64`
        );
      }) 
      const data = await res.text();
      const response = await decryptPublishes([{ data }], secretKey);
  
      const messageData = response[0];
      setAnnouncementData((prev) => {
        return {
          ...prev,
          [`${identifier}-${name}`]: messageData,
        };
      });
  
    } catch (error) {}
  };

 



  useEffect(() => {
    if (!secretKey || hasInitializedWebsocket.current) return;
    setIsLoading(true);
    // initWebsocketMessageGroup()
    hasInitializedWebsocket.current = true;
  }, [secretKey]);

  const encryptChatMessage = async (data: string, secretKeyObject: any) => {
    try {
      return new Promise((res, rej) => {
        chrome.runtime.sendMessage(
          {
            action: "encryptSingle",
            payload: {
              data,
              secretKeyObject,
            },
          },
          (response) => {
            if (!response?.error) {
              res(response);
              return;
            }
            rej(response.error);
          }
        );
      });
    } catch (error) {}
  };

  const publishAnc = async ({ encryptedData, identifier }: any) => {
   
      
      return new Promise((res, rej) => {
        chrome.runtime.sendMessage(
          {
            action: "publishGroupEncryptedResource",
            payload: {
              encryptedData,
              identifier,
            },
          },
          (response) => {
            if (!response?.error) {
              res(response);
            }
            rej(response.error);
          }
        );
      });
  };
  const clearEditorContent = () => {
    if (editorRef.current) {
      editorRef.current.chain().focus().clearContent().run();
    }
  };

  const setTempData = async ()=> {
    try {
      const getTempAnnouncements = await getTempPublish()
  if(getTempAnnouncements?.announcement){
    let tempData = []
    Object.keys(getTempAnnouncements?.announcement || {}).map((key)=> {
      const value = getTempAnnouncements?.announcement[key]
      tempData.push(value.data)
    })
    setTempPublishedList(tempData)
  }
    } catch (error) {
      
    }
   
  }

  const publishAnnouncement = async () => {
    try {
      const fee = await getFee('ARBITRARY')
      await show({
        message: "Would you like to perform a ARBITRARY transaction?" ,
        publishFee: fee.fee + ' QORT'
      })
      if (isSending) return;
      if (editorRef.current) {
        const htmlContent = editorRef.current.getHTML();
        if (!htmlContent?.trim() || htmlContent?.trim() === "<p></p>") return;
        setIsSending(true);
        const message = {
          version: 1,
          extra: {},
          message: htmlContent
        }
        const secretKeyObject = await getSecretKey();
        const message64: any = await objectToBase64(message);
        const encryptSingle = await encryptChatMessage(
          message64,
          secretKeyObject
        );
        const randomUid = uid.rnd();
      const identifier = `grp-${selectedGroup}-anc-${randomUid}`;
        const res = await publishAnc({
          encryptedData: encryptSingle,
          identifier
        });

        const dataToSaveToStorage = {
          name: myName,
          identifier,
          service: 'DOCUMENT',
          tempData: message,
          created: Date.now()
        }
        await saveTempPublish({data: dataToSaveToStorage, key: 'announcement'})
        setTempData()
        clearEditorContent();
      }
      // send chat message
    } catch (error) {
      setInfoSnack({
        type: "error",
        message: error,
      });
      setOpenSnack(true)
    } finally {
      setIsSending(false);
    }
  };

 

  const getAnnouncements = React.useCallback(
    async (selectedGroup) => {
      try {
        const offset = 0;

        // dispatch(setIsLoadingGlobal(true))
        const identifier = `grp-${selectedGroup}-anc-`;
        const url = `${getBaseApiReact()}/arbitrary/resources/search?mode=ALL&service=DOCUMENT&identifier=${identifier}&limit=20&includemetadata=false&offset=${offset}&reverse=true&prefix=true`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        const responseData = await response.json();
        
        setTempData()
        setAnnouncements(responseData);
        setIsLoading(false);
        for (const data of responseData) {
          getAnnouncementData({ name: data.name, identifier: data.identifier });
        }
      } catch (error) {
      } finally {
        // dispatch(setIsLoadingGlobal(false))
      }
    },
    [secretKey]
  );
 
  React.useEffect(() => {
    if (selectedGroup && secretKey && !hasInitialized.current) {
      getAnnouncements(selectedGroup);
      hasInitialized.current = true
    }
  }, [selectedGroup, secretKey]);


  const loadMore = async()=> {
    try {
      setIsLoading(true);

      const offset = announcements.length
    const identifier = `grp-${selectedGroup}-anc-`;
        const url = `${getBaseApiReact()}/arbitrary/resources/search?mode=ALL&service=DOCUMENT&identifier=${identifier}&limit=20&includemetadata=false&offset=${offset}&reverse=true&prefix=true`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        const responseData = await response.json();

        setAnnouncements((prev)=> [...prev, ...responseData]);
        setIsLoading(false);
        for (const data of responseData) {
          getAnnouncementData({ name: data.name, identifier: data.identifier });
        }
    } catch (error) {
      
    }
    
  }

  const interval = useRef<any>(null)

  const checkNewMessages = React.useCallback(
    async () => {
      try {
      
        const identifier = `grp-${selectedGroup}-anc-`;
        const url = `${getBaseApiReact()}/arbitrary/resources/search?mode=ALL&service=DOCUMENT&identifier=${identifier}&limit=20&includemetadata=false&offset=${0}&reverse=true&prefix=true`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        const responseData = await response.json()
        const latestMessage = announcements[0]
        if (!latestMessage) {
          for (const data of responseData) {
            try {
             
                getAnnouncementData({ name: data.name, identifier: data.identifier });
              
            } catch (error) {}
          }
          setAnnouncements(responseData)
          return
        }
        const findMessage = responseData?.findIndex(
          (item: any) => item?.identifier === latestMessage?.identifier
        )
      
        if(findMessage === -1) return
        const newArray = responseData.slice(0, findMessage)
        
        for (const data of newArray) {
          try {
           
              getAnnouncementData({ name: data.name, identifier: data.identifier });
            
          } catch (error) {}
        }
        setAnnouncements((prev)=> [...newArray, ...prev])
      } catch (error) {
      } finally {
      }
    },
    [announcements, secretKey, selectedGroup]
  )

  const checkNewMessagesFunc = useCallback(() => {
    let isCalling = false
    interval.current = setInterval(async () => {
      if (isCalling) return
      isCalling = true
      const res = await checkNewMessages()
      isCalling = false
    }, 20000)
  }, [checkNewMessages])

  useEffect(() => {
    if(!secretKey) return
    checkNewMessagesFunc()
    return () => {
      if (interval?.current) {
        clearInterval(interval.current)
      }
    }
  }, [checkNewMessagesFunc])



  const combinedListTempAndReal = useMemo(() => {
    // Combine the two lists
    const combined = [...tempPublishedList, ...announcements];
  
    // Remove duplicates based on the "identifier"
    const uniqueItems = new Map();
    combined.forEach(item => {
      uniqueItems.set(item.identifier, item);  // This will overwrite duplicates, keeping the last occurrence
    });
  
    // Convert the map back to an array and sort by "created" timestamp in descending order
    const sortedList = Array.from(uniqueItems.values()).sort((a, b) => b.created - a.created);
  
    return sortedList;
  }, [tempPublishedList, announcements]);


  if(selectedAnnouncement){
    return (
      <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        visibility: hide && 'hidden',
      position: hide && 'fixed',
      left: hide && '-1000px'
      }}
    >
      <AnnouncementDiscussion myName={myName} show={show} secretKey={secretKey} selectedAnnouncement={selectedAnnouncement} setSelectedAnnouncement={setSelectedAnnouncement} encryptChatMessage={encryptChatMessage} getSecretKey={getSecretKey} />
      </div>
    )
  }

 

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        visibility: hide && 'hidden',
      position: hide && 'fixed',
      left: hide && '-1000px'
      }}
    >
       <div style={{
        position: "relative",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}>
      <Box
        sx={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          padding: "25px",
          fontSize: "20px",
          gap: '20px',
          alignItems: 'center'
        }}
      >
        <CampaignIcon sx={{
          fontSize: '30px'
        }} />
        Group Announcements
      </Box>
      <Spacer height="25px" />

      </div>
      {!isLoading && combinedListTempAndReal?.length === 0 && (
         <Box sx={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center'
        }}>
         <Typography sx={{
          fontSize: '16px'
        }}>No announcements</Typography>
        </Box>
      )}
      <AnnouncementList
        announcementData={announcementData}
        initialMessages={combinedListTempAndReal}
        setSelectedAnnouncement={setSelectedAnnouncement}
        disableComment={false}
        showLoadMore={announcements.length > 0 && announcements.length % 20 === 0}
        loadMore={loadMore}
      />
      
    
{isAdmin && (
   <div
   style={{
     // position: 'fixed',
     // bottom: '0px',
     backgroundColor: "#232428",
     minHeight: "150px",
     maxHeight: "400px",
     display: "flex",
     flexDirection: "column",
     overflow: "hidden",
     width: "100%",
     boxSizing: "border-box",
     padding: "20px",
     flexShrink: 0
   }}
 >
   <div
     style={{
       display: "flex",
       flexDirection: "column",
       // height: '100%',
       overflow: "auto",
     }}
   >
     <Tiptap
       setEditorRef={setEditorRef}
       onEnter={publishAnnouncement}
       disableEnter
     />
   </div>
   <CustomButton
     onClick={() => {
       if (isSending) return;
       publishAnnouncement();
     }}
     style={{
       marginTop: "auto",
       alignSelf: "center",
       cursor: isSending ? "default" : "pointer",
       background: isSending && "rgba(0, 0, 0, 0.8)",
       flexShrink: 0,
     }}
   >
     {isSending && (
       <CircularProgress
         size={18}
         sx={{
           position: "absolute",
           top: "50%",
           left: "50%",
           marginTop: "-12px",
           marginLeft: "-12px",
           color: "white",
         }}
       />
     )}
     {` Publish Announcement`}
   </CustomButton>
 </div>
)}

<CustomizedSnackbars open={openSnack} setOpen={setOpenSnack} info={infoSnack} setInfo={setInfoSnack}  />

      <LoadingSnackbar
        open={isLoading}
        info={{
          message: "Loading announcements... please wait.",
        }}
      />
    </div>
  );
};