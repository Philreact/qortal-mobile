import * as React from 'react';
import Button from '@mui/material/Button';
import Snackbar, { SnackbarCloseReason } from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

export const  LoadingSnackbar = ({open,  info}) => {

  return (
    <div>
      <Snackbar anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} open={open}>
        <Alert
          severity="info"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {info?.message}
        </Alert>
      </Snackbar>
    </div>
  );
}