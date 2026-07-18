"use client";

import * as React from "react";
import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";

const DialogContext = createContext({});

function Dialog({ children, open, onOpenChange, ...props }) {
  const [isOpen, setIsOpen] = useState(open || false);

  React.useEffect(() => {
    if (open !== undefined) {
      setIsOpen(open);
    }
  }, [open]);

  const handleOpenChange = (newOpen) => {
    setIsOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  return (
    <DialogContext.Provider value={{ isOpen, setOpen: handleOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

function DialogTrigger({ children, asChild, ...props }) {
  const { setOpen } = useContext(DialogContext);

  if (asChild) {
    return React.cloneElement(children, {
      ...props,
      onClick: (e) => {
        children.props.onClick?.(e);
        setOpen(true);
      },
    });
  }

  return (
    <button
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        setOpen(true);
      }}
    >
      {children}
    </button>
  );
}

function DialogContent({ children, className = "", ...props }) {
  const { isOpen, setOpen } = useContext(DialogContext);

  if (!isOpen) return null;

  const dialogContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[9999] animate-in fade-in duration-200"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div
          className={`bg-white rounded-2xl shadow-xl w-full max-h-[90vh] overflow-y-auto relative z-[10000] animate-in zoom-in-95 slide-in-from-bottom-2 duration-200 max-w-md ${className}`}
          onClick={(e) => e.stopPropagation()}
          {...props}
        >
          {children}
        </div>
      </div>
    </>
  );

  // Use portal to render at document root
  if (typeof window !== "undefined") {
    return createPortal(dialogContent, document.body);
  }

  return dialogContent;
}

function DialogHeader({ children, className = "", ...props }) {
  return (
    <div className={`px-6 py-4 border-b ${className}`} {...props}>
      {children}
    </div>
  );
}

function DialogTitle({ children, className = "", ...props }) {
  return (
    <h2
      className={`text-lg font-semibold text-gray-900 ${className}`}
      {...props}
    >
      {children}
    </h2>
  );
}

function DialogDescription({ children, className = "", ...props }) {
  return (
    <p className={`text-sm text-gray-600 mt-1 ${className}`} {...props}>
      {children}
    </p>
  );
}

function DialogFooter({ children, className = "", ...props }) {
  return (
    <div
      className={`px-6 py-4 border-t flex justify-end gap-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

function DialogClose({ children, asChild, ...props }) {
  const { setOpen } = useContext(DialogContext);

  if (asChild) {
    return React.cloneElement(children, {
      ...props,
      onClick: (e) => {
        children.props.onClick?.(e);
        setOpen(false);
      },
    });
  }

  return (
    <button
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
};
