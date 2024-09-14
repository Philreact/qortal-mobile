import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Box, Button, IconButton, Skeleton } from "@mui/material";
import { ShowMessage } from "./ShowMessageWithoutModal";
// import {
//   setIsLoadingCustom,
// } from '../../state/features/globalSlice'
import {
  ComposeP,
  GroupContainer,
  GroupNameP,
  MailIconImg,
  ShowMessageReturnButton,
  SingleThreadParent,
  ThreadContainer,
  ThreadContainerFullWidth,
} from "./Mail-styles";
import { Spacer } from "../../../common/Spacer";
import { threadIdentifier } from "./GroupMail";
import LazyLoad from "../../../common/LazyLoad";
import ReturnSVG from "../../../assets/svgs/Return.svg";
import { NewThread } from "./NewThread";
import { decryptPublishes, getTempPublish } from "../../Chat/GroupAnnouncements";
import { LoadingSnackbar } from "../../Snackbar/LoadingSnackbar";
import { subscribeToEvent, unsubscribeFromEvent } from "../../../utils/events";
import RefreshIcon from "@mui/icons-material/Refresh";
import { getBaseApi } from "../../../background";
import { getBaseApiReact } from "../../../App";

interface ThreadProps {
  currentThread: any;
  groupInfo: any;
  closeThread: () => void;
  members: any;
}

const getEncryptedResource = async ({ name, identifier, secretKey }) => {
  const res = await fetch(
    `${getBaseApiReact()}/arbitrary/DOCUMENT/${name}/${identifier}?encoding=base64`
  );
  const data = await res.text();
  const response = await decryptPublishes([{ data }], secretKey);

  const messageData = response[0];
  return messageData.decryptedData;
};

export const Thread = ({
  currentThread,
  groupInfo,
  closeThread,
  members,
  userInfo,
  secretKey,
  getSecretKey,
  updateThreadActivityCurrentThread
}: ThreadProps) => {
  const [tempPublishedList, setTempPublishedList] = useState([])

  const [messages, setMessages] = useState<any[]>([]);
  const [hashMapMailMessages, setHashMapMailMessages] = useState({});
  const [hasFirstPage, setHasFirstPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [postReply, setPostReply] = useState(null);
  const [hasLastPage, setHasLastPage] = useState(false);

  const secretKeyRef = useRef(null);
  const currentThreadRef = useRef(null);
  const containerRef = useRef(null);
  useEffect(() => {
    currentThreadRef.current = currentThread;
  }, [currentThread]);

  useEffect(() => {
    secretKeyRef.current = secretKey;
  }, [secretKey]);

  const getIndividualMsg = async (message: any) => {
    try {
      const responseDataMessage = await getEncryptedResource({
        identifier: message.identifier,
        name: message.name,
        secretKey,
      });
     

      const fullObject = {
        ...message,
        ...(responseDataMessage || {}),
        id: message.identifier,
      };
      setHashMapMailMessages((prev) => {
        return {
          ...prev,
          [message.identifier]: fullObject,
        };
      });
    } catch (error) {}
  };

  const setTempData = async ()=> {
    try {
      let threadId = currentThread.threadId;
      
      const keyTemp = 'thread-post'
      const getTempAnnouncements = await getTempPublish()
  
  if(getTempAnnouncements?.[keyTemp]){
   
    let tempData = []
    Object.keys(getTempAnnouncements?.[keyTemp] || {}).map((key)=> {
      const value = getTempAnnouncements?.[keyTemp][key]
 
      if(value.data?.threadId === threadId){
        tempData.push(value.data)
      }
     
    })
    setTempPublishedList(tempData)
  }
    } catch (error) {
      
    }
   
  }


  const getMailMessages = React.useCallback(
    async (groupInfo: any, before, after, isReverse) => {
      try {
        setTempPublishedList([])
        setIsLoading(true);
        setHasFirstPage(false);
        setHasPreviousPage(false);
        setHasLastPage(false);
        setHasNextPage(false);
        let threadId = groupInfo.threadId;
   
        const identifier = `thmsg-${threadId}`;
        let url = `${getBaseApiReact()}/arbitrary/resources/search?mode=ALL&service=${threadIdentifier}&identifier=${identifier}&limit=20&includemetadata=false&prefix=true`;
        if (!isReverse) {
          url = url + "&reverse=false";
        }
        if (isReverse) {
          url = url + "&reverse=true";
        }
        if (after) {
          url = url + `&after=${after}`;
        }
        if (before) {
          url = url + `&before=${before}`;
        }

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        const responseData = await response.json();
      

        let fullArrayMsg = [...responseData];
        if (isReverse) {
          fullArrayMsg = fullArrayMsg.reverse();
        }
        // let newMessages: any[] = []
        for (const message of responseData) {
          getIndividualMsg(message);
        }
        setMessages(fullArrayMsg);
        if (before === null && after === null && isReverse) {
          setTimeout(() => {
            containerRef.current.scrollIntoView({ behavior: "smooth" });
          }, 300);
          
        }
   
        if (fullArrayMsg.length === 0){
          setTempData()
          return;
        } 
        // check if there are newer posts
        const urlNewer = `${getBaseApiReact()}/arbitrary/resources/search?mode=ALL&service=${threadIdentifier}&identifier=${identifier}&limit=1&includemetadata=false&reverse=false&prefix=true&before=${fullArrayMsg[0].created}`;
        const responseNewer = await fetch(urlNewer, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        const responseDataNewer = await responseNewer.json();
        if (responseDataNewer.length > 0) {
          setHasFirstPage(true);
          setHasPreviousPage(true);
        } else {
          setHasFirstPage(false);
          setHasPreviousPage(false);
        }
        // check if there are older posts
        const urlOlder = `${getBaseApiReact()}/arbitrary/resources/search?mode=ALL&service=${threadIdentifier}&identifier=${identifier}&limit=1&includemetadata=false&reverse=false&prefix=true&after=${
          fullArrayMsg[fullArrayMsg.length - 1].created
        }`;
        const responseOlder = await fetch(urlOlder, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        const responseDataOlder = await responseOlder.json();
        if (responseDataOlder.length > 0) {
          setHasLastPage(true);
          setHasNextPage(true);
        } else {
          setHasLastPage(false);
          setHasNextPage(false);
          setTempData()
          updateThreadActivityCurrentThread()
        }
      } catch (error) {
      } finally {
        setIsLoading(false);
        
      }
    },
    [messages, secretKey]
  );
  const getMessages = React.useCallback(async () => {
  
    if (!currentThread || !secretKey) return;
    await getMailMessages(currentThread, null, null, false);
  }, [getMailMessages, currentThread, secretKey]);
  const firstMount = useRef(false);

  const saveTimestamp = useCallback((currentThread: any, username?: string) => {
    if (
      !currentThread?.threadData?.groupId ||
      !currentThread?.threadId ||
      !username
    )
      return;
    const threadIdForLocalStorage = `qmail_threads_${currentThread?.threadData?.groupId}_${currentThread?.threadId}`;
    const threads = JSON.parse(
      localStorage.getItem(`qmail_threads_viewedtimestamp_${username}`) || "{}"
    );
    // Convert to an array of objects with identifier and all fields
    let dataArray = Object.entries(threads).map(([identifier, value]) => ({
      identifier,
      ...(value as any),
    }));

    // Sort the array based on timestamp in descending order
    dataArray.sort((a, b) => b.timestamp - a.timestamp);

    // Slice the array to keep only the first 500 elements
    let latest500 = dataArray.slice(0, 500);

    // Convert back to the original object format
    let latest500Data: any = {};
    latest500.forEach((item) => {
      const { identifier, ...rest } = item;
      latest500Data[identifier] = rest;
    });
    latest500Data[threadIdForLocalStorage] = {
      timestamp: Date.now(),
    };
    localStorage.setItem(
      `qmail_threads_viewedtimestamp_${username}`,
      JSON.stringify(latest500Data)
    );
  }, []);

  const getMessagesMiddleware = async () => {
    await new Promise((res) => {
      setTimeout(() => {
        res(null);
      }, 400);
    });
    if (firstMount.current) return;
    getMessages();
    firstMount.current = true;
  };
  useEffect(() => {
    if (currentThreadRef.current?.threadId !== currentThread?.threadId) {
      firstMount.current = false;
    }
    if (currentThread && secretKey && !firstMount.current) {
      getMessagesMiddleware();

      // saveTimestamp(currentThread, user.name)
    }
  }, [currentThread, secretKey]);
  const messageCallback = useCallback((msg: any) => {
    // dispatch(addToHashMapMail(msg))
    // setMessages((prev) => [msg, ...prev])
  }, []);

  const interval = useRef<any>(null);

  const checkNewMessages = React.useCallback(
    async (groupInfo: any) => {
      try {
        let threadId = groupInfo.threadId;

        const identifier = `thmsg-${threadId}`;
        const url = `${getBaseApiReact()}/arbitrary/resources/search?mode=ALL&service=${threadIdentifier}&identifier=${identifier}&limit=20&includemetadata=false&offset=${0}&reverse=true&prefix=true`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        const responseData = await response.json();
        const latestMessage = messages[0];
        if (!latestMessage) return;
        const findMessage = responseData?.findIndex(
          (item: any) => item?.identifier === latestMessage?.identifier
        );
        let sliceLength = responseData.length;
        if (findMessage !== -1) {
          sliceLength = findMessage;
        }
        const newArray = responseData.slice(0, findMessage).reverse();
        let fullArrayMsg = [...messages];
        for (const message of newArray) {
          try {
            const responseDataMessage = await getEncryptedResource({
              identifier: message.identifier,
              name: message.name,
              secretKey: secretKeyRef.current,
            });

            const fullObject = {
              ...message,
              ...(responseDataMessage || {}),
              id: message.identifier,
            };
            setHashMapMailMessages((prev) => {
              return {
                ...prev,
                [message.identifier]: fullObject,
              };
            });
            const index = messages.findIndex(
              (p) => p.identifier === fullObject.identifier
            );
            if (index !== -1) {
              fullArrayMsg[index] = fullObject;
            } else {
              fullArrayMsg.unshift(fullObject);
            }
          } catch (error) {}
        }
        setMessages(fullArrayMsg);
      } catch (error) {
      } finally {
      }
    },
    [messages]
  );

  // const checkNewMessagesFunc = useCallback(() => {
  //   let isCalling = false
  //   interval.current = setInterval(async () => {
  //     if (isCalling) return
  //     isCalling = true
  //     const res = await checkNewMessages(currentThread)
  //     isCalling = false
  //   }, 8000)
  // }, [checkNewMessages,  currentThrefirstMount.current = truead])

  // useEffect(() => {
  //   checkNewMessagesFunc()
  //   return () => {
  //     if (interval?.current) {
  //       clearInterval(interval.current)
  //     }
  //   }
  // }, [checkNewMessagesFunc])

  const openNewPostWithQuote = useCallback((reply) => {
    setPostReply(reply);
  }, []);

  const closeCallback = useCallback(() => {
    setPostReply(null);
  }, []);

  const threadFetchModeFunc = (e) => {
    const mode = e.detail?.mode;
    if (mode === "last-page") {
      getMailMessages(currentThread, null, null, true);
    }
    firstMount.current = true;
  };

  React.useEffect(() => {
    subscribeToEvent("threadFetchMode", threadFetchModeFunc);

    return () => {
      unsubscribeFromEvent("threadFetchMode", threadFetchModeFunc);
    };
  }, []);

  const combinedListTempAndReal = useMemo(() => {
    // Combine the two lists
    const combined = [...tempPublishedList, ...messages];
  
    // Remove duplicates based on the "identifier"
    const uniqueItems = new Map();
    combined.forEach(item => {
      uniqueItems.set(item.identifier, item);  // This will overwrite duplicates, keeping the last occurrence
    });
  
    // Convert the map back to an array and sort by "created" timestamp in descending order
    const sortedList = Array.from(uniqueItems.values()).sort((a, b) => a.created - b.created);
  
    return sortedList;
  }, [tempPublishedList, messages]);

  if (!currentThread) return null;
  return (
    <GroupContainer
      sx={{
        position: "relative",
        overflow: "auto",
        width: "100%",
      }}
    >
      <NewThread
        groupInfo={groupInfo}
        isMessage={true}
        currentThread={currentThread}
        messageCallback={messageCallback}
        members={members}
        userInfo={userInfo}
        getSecretKey={getSecretKey}
        closeCallback={closeCallback}
        postReply={postReply}
        myName={userInfo?.name}
        publishCallback={setTempData}
      />
      <ThreadContainerFullWidth>
        <ThreadContainer >
          <Spacer height="30px" />
          <Box
            sx={{
              width: "100%",
              alignItems: "center",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <GroupNameP>{currentThread?.threadData?.title}</GroupNameP>

            <ShowMessageReturnButton
              onClick={() => {
                setMessages([]);
                closeThread();
              }}
            >
              <MailIconImg src={ReturnSVG} />
              <ComposeP>Return to Threads</ComposeP>
            </ShowMessageReturnButton>
          </Box>
          <Box
            sx={{
              width: "100%",
              alignItems: "center",
              display: "flex",
              justifyContent: "center",
              gap: "5px",
            }}
          >
            <Button
              onClick={() => {
                getMailMessages(currentThread, null, null, false);
              }}
              disabled={!hasFirstPage}
              variant="contained"
            >
              First Page
            </Button>
            <Button
              onClick={() => {
                getMailMessages(
                  currentThread,
                  messages[0].created,
                  null,
                  false
                );
              }}
              disabled={!hasPreviousPage}
              variant="contained"
            >
              Previous Page
            </Button>
            <Button
              onClick={() => {
                getMailMessages(
                  currentThread,
                  null,
                  messages[messages.length - 1].created,
                  false
                );
              }}
              disabled={!hasNextPage}
              variant="contained"
            >
              Next page
            </Button>
            <Button
              onClick={() => {
                getMailMessages(currentThread, null, null, true);
              }}
              disabled={!hasLastPage}
              variant="contained"
            >
              Last page
            </Button>
          </Box>
          <Spacer height="60px" />
          {combinedListTempAndReal.map((message) => {
            let fullMessage =  message;

            if (hashMapMailMessages[message?.identifier]) {
              fullMessage = hashMapMailMessages[message.identifier];
              return (
                <ShowMessage
                  key={message?.identifier}
                  message={fullMessage}
                  openNewPostWithQuote={openNewPostWithQuote}
                  myName={userInfo?.name}
                />
              );
            } else if(message?.tempData){
              return (
                <ShowMessage
                  key={message?.identifier}
                  message={message?.tempData}
                  openNewPostWithQuote={openNewPostWithQuote}
                  myName={userInfo?.name}
                />
              );
            }

            return (
              <SingleThreadParent>
                <Skeleton
                  variant="rectangular"
                  style={{
                    width: "100%",
                    height: 60,
                    borderRadius: "8px",
                    overflow: "hidden",
                  }}
                />
              </SingleThreadParent>
            );
          })}
          <div ref={containerRef} />
          {!hasLastPage && !isLoading && (
            <>
              <Spacer height="20px" />
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={() => {
                    getMailMessages(currentThread, null, null, true);
                  }}
                  sx={{
                    color: "white",
                  }}
                >
                  Refetch page
                </Button>
              </Box>
            </>
          )}

          {messages?.length > 4 && (
            <>
              <Spacer height="30px" />
              <Box
                sx={{
                  width: "100%",
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "center",
                  gap: "5px",
                }}
              >
                <Button
                  onClick={() => {
                    getMailMessages(currentThread, null, null, false);
                  }}
                  disabled={!hasFirstPage}
                  variant="contained"
                >
                  First Page
                </Button>
                <Button
                  onClick={() => {
                    getMailMessages(
                      currentThread,
                      messages[0].created,
                      null,
                      false
                    );
                  }}
                  disabled={!hasPreviousPage}
                  variant="contained"
                >
                  Previous Page
                </Button>
                <Button
                  onClick={() => {
                    getMailMessages(
                      currentThread,
                      null,
                      messages[messages.length - 1].created,
                      false
                    );
                  }}
                  disabled={!hasNextPage}
                  variant="contained"
                >
                  Next page
                </Button>
                <Button
                  onClick={() => {
                    getMailMessages(currentThread, null, null, true);
                  }}
                  disabled={!hasLastPage}
                  variant="contained"
                >
                  Last page
                </Button>
              </Box>
              <Spacer height="30px" />
            </>
          )}
        </ThreadContainer>
      </ThreadContainerFullWidth>
      {/* {messages.length >= 20 && (
              <LazyLoad onLoadMore={()=> getMailMessages(currentThread, false, true)}></LazyLoad>

      )} */}
      <LoadingSnackbar
        open={isLoading}
        info={{
          message: "Loading posts... please wait.",
        }}
      />
    </GroupContainer>
  );
};
