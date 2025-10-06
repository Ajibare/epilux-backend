// server/utils/dataExport.js
export const generateJsonExport = (data) => {
  return JSON.stringify(data, null, 2);
};