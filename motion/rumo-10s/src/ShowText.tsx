import React, {createContext, useContext} from 'react';

const Ctx = createContext(true);
export const ShowTextProvider: React.FC<{value: boolean; children: React.ReactNode}> = ({value, children}) => (
  <Ctx.Provider value={value}>{children}</Ctx.Provider>
);
/** false in the "sem texto" (textless) master. */
export const useShowText = () => useContext(Ctx);
