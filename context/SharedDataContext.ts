import { createContext } from 'react';
import { DataContextType } from '../types';

export const SharedDataContext = createContext<DataContextType | undefined>(undefined);
