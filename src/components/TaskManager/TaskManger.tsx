import { List, ListItemButton, ListItemIcon } from "@mui/material";
import React, { useContext, useEffect, useRef } from "react";

import ListItemText from "@mui/material/ListItemText";
import Collapse from "@mui/material/Collapse";
import InboxIcon from "@mui/icons-material/MoveToInbox";

import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import StarBorder from "@mui/icons-material/StarBorder";
import PendingIcon from "@mui/icons-material/Pending";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import { MyContext, getBaseApiReact } from "../../App";
import { getBaseApi } from "../../background";



export const TaskManger = ({getUserInfo}) => {
  const { txList, setTxList, memberGroups } = useContext(MyContext);
  const [open, setOpen] = React.useState(true);
   
  const handleClick = () => {
    setOpen(!open);
  };

  const intervals = useRef({})

  const getStatus = ({signature}, callback?: any) =>{
   
		let stop = false

		const getAnswer = async () => {
			const getTx = async () => {
				const url = `${getBaseApiReact()}/transactions/signature/${signature}`
				const res = await fetch(url)

				return await res.json()
			}

			if (!stop) {
				stop = true

				try {
					const txTransaction = await getTx()
          
					if (!txTransaction.error && txTransaction.signature) {
            await new Promise((res)=> {
              setTimeout(() => {
                  res(null)
              }, 300000);
            })
						setTxList((prev)=> {
              let previousData = [...prev];
              const findTxWithSignature = previousData.findIndex((tx)=> tx.signature === signature)
              if(findTxWithSignature !== -1){
                previousData[findTxWithSignature].done = true;
                return previousData
              }
              return previousData
            })
            if(callback){
              callback(true)
            }
            clearInterval(intervals.current[signature])

					}
				} catch (error) { }

				stop = false
			}
		}

		intervals.current[signature] = setInterval(getAnswer, 120000)
	}

  useEffect(() => {
    setTxList((prev) => {
      let previousData = [...prev];
      memberGroups.forEach((group) => {
        const findGroup = txList.findIndex(
          (tx) => tx?.type === "joined-group" && tx?.groupId === group.groupId
        );
        if (findGroup !== -1 && !previousData[findGroup]?.done ) {
          // add notification
          previousData[findGroup].done = true;
        }
        
      });
      memberGroups.forEach((group) => {
        const findGroup = txList.findIndex(
          (tx) => tx?.type === "created-group" && tx?.groupName === group.groupName
        );
        if (findGroup !== -1 && !previousData[findGroup]?.done ) {
          // add notification
          previousData[findGroup].done = true;
        }
        
      });
      prev.forEach((tx, index)=> {
        if(tx?.type === "leave-group" && memberGroups.findIndex(
          (group) => tx?.groupId  === group.groupId
        ) === -1){
          previousData[index].done = true;
        }

      })
      prev.forEach((tx, index)=> {
      
        if(tx?.type === "created-common-secret" && tx?.signature && !tx.done){
          if(intervals.current[tx.signature]) return

          getStatus({signature: tx.signature})
        }

      })
      prev.forEach((tx, index)=> {
      
        if(tx?.type === "joined-group-request" && tx?.signature && !tx.done){
          if(intervals.current[tx.signature]) return

          getStatus({signature: tx.signature})
        }

      })
      prev.forEach((tx, index)=> {
      
        if(tx?.type === "register-name" && tx?.signature && !tx.done){
          if(intervals.current[tx.signature]) return

          getStatus({signature: tx.signature}, getUserInfo)
        }

      })
     
      return previousData;
    });
  }, [memberGroups, getUserInfo]);

  if (txList?.length === 0 || txList.filter((item) => !item?.done).length === 0) return null;
  return (
    <List
      sx={{ width: "100%", maxWidth: 360, bgcolor: "background.paper" }}
      component="nav"
      aria-labelledby="nested-list-subheader"
    >
      <ListItemButton onClick={handleClick}>
        <ListItemIcon>
          {txList.find((item) => !item.done) ? (
            <PendingIcon sx={{
              color: 'white'
            }} />
          ) : (
            <TaskAltIcon sx={{
              color: 'white'
            }} />
          )}
        </ListItemIcon>
        <ListItemText primary="Ongoing Transactions" />
        {open ? <ExpandLess /> : <ExpandMore />}
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          {txList.map((item) => {
            return (
              <ListItemButton key={item?.signature} sx={{ pl: 4 }}>
                
                <ListItemText primary={item?.done ? item.labelDone : item.label} />
              </ListItemButton>
            );
          })}
        </List>
      </Collapse>
    </List>
  );
};