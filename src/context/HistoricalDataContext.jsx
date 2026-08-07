// src/context/HistoricalDataContext.jsx
import { createContext, useContext, useState } from "react";
import { getAllSensorData, getWeeklySensorData } from "../services/senmlService";
import { useAuth } from "./AuthContext";

const HistoricalDataContext = createContext(null);

export const useHistoricalData = () => {
  const context = useContext(HistoricalDataContext);
  if (!context) {
    throw new Error("useHistoricalData must be used within a HistoricalDataProvider");
  }
  return context;
};

export const HistoricalDataProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [weeklyData, setWeeklyData] = useState({});
  const [allData, setAllData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Fetch weekly data for all sensors
  const fetchWeeklyData = async (sensorName) => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const result = await getWeeklySensorData(sensorName, 7);
      
      if (result.success) {
        setWeeklyData(prev => ({
          ...prev,
          [sensorName]: result.data
        }));
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Error fetching weekly data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch all sensor data for a time range
  const fetchAllSensorData = async (from, to) => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const result = await getAllSensorData(from, to);
      
      if (result.success) {
        setAllData(result.data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Error fetching all sensor data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch weekly data for a specific sensor when requested
  const getSensorWeeklyData = async (sensorKey) => {
    // Check if we already have data
    if (weeklyData[sensorKey] && weeklyData[sensorKey].length > 0) {
      return weeklyData[sensorKey];
    }

    // Fetch fresh data
    await fetchWeeklyData(sensorKey);
    return weeklyData[sensorKey] || [];
  };

  const value = {
    weeklyData,
    allData,
    isLoading,
    lastUpdated,
    fetchWeeklyData,
    fetchAllSensorData,
    getSensorWeeklyData,
  };

  return (
    <HistoricalDataContext.Provider value={value}>
      {children}
    </HistoricalDataContext.Provider>
  );
};