"use client";

import { createContext, useContext } from "react";

/**
 * How a menu item closes the menu it is in.
 *
 * Its own module because both halves of the menu need it — the panel provides
 * it, the items consume it — and putting it in either one would make the two
 * import each other.
 */
export const MenuContext = createContext<{ close: () => void }>({ close: () => {} });

export const useMenu = () => useContext(MenuContext);
