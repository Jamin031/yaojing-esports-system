import EventEmitter from "events";

export const orderEmitter = new EventEmitter();

export function buildOrderNotifyPayload({ storeName, amount, contact }) {
  return {
    title: `${storeName}来单`,
    amount,
    contact
  };
}

