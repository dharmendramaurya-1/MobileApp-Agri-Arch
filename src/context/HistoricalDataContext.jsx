// src/context/HistoricalDataContext.jsx
import { createContext, useCallback, useContext, useState } from "react";
import {
  downsampleData,
  fetchAllSensorHistorical,
  getAllSensorData,
  getWeeklySensorData
} from "../services/senmlService";
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
  const [error, setError] = useState(null);

  // Fetch weekly data for all sensors
  const fetchWeeklyData = useCallback(async (sensorName) => {
    if (!isAuthenticated) {
      setError("User not authenticated");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getWeeklySensorData(sensorName, 7);
      
      if (result.success) {
        setWeeklyData(prev => ({
          ...prev,
          [sensorName]: result.data
        }));
        setLastUpdated(new Date());
      } else {
        setError(result.error || "Failed to fetch weekly data");
      }
    } catch (error) {
      console.error("Error fetching weekly data:", error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch all sensor data for a time range
  const fetchAllSensorData = useCallback(async (from, to, limit = 1000) => {
    if (!isAuthenticated) {
      setError("User not authenticated");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await getAllSensorData(from, to, limit);
      
      if (result.success) {
        setAllData(result.data);
        setLastUpdated(new Date());
      } else {
        setError(result.error || "Failed to fetch sensor data");
      }
    } catch (error) {
      console.error("Error fetching all sensor data:", error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch ALL historical data for a specific sensor (for graphs)
  const fetchSensorHistorical = useCallback(async ({
    sensorKey,
    from,
    to,
    pageSize = 100,
    maxPages = 50,
  }) => {
    if (!isAuthenticated) {
      setError("User not authenticated");
      return { success: false, error: "Not authenticated", data: [] };
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAllSensorHistorical({
        sensorKey,
        from,
        to,
        pageSize,
        maxPages,
      });

      if (result.success) {
        const downsampled = downsampleData(result.data, 200);
        return {
          success: true,
          data: downsampled,
          total: result.total,
          originalCount: result.data.length,
        };
      } else {
        setError(result.error || "Failed to fetch historical data");
        return { success: false, error: result.error, data: [] };
      }
    } catch (error) {
      console.error("Error fetching historical data:", error);
      setError(error.message);
      return { success: false, error: error.message, data: [] };
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Get weekly data for a specific sensor (with caching)
  const getSensorWeeklyData = useCallback(async (sensorKey) => {
    if (weeklyData[sensorKey] && weeklyData[sensorKey].length > 0) {
      return weeklyData[sensorKey];
    }

    await fetchWeeklyData(sensorKey);
    return weeklyData[sensorKey] || [];
  }, [weeklyData, fetchWeeklyData]);

  // Clear all cached data
  const clearCache = useCallback(() => {
    setWeeklyData({});
    setAllData({});
    setLastUpdated(null);
    setError(null);
  }, []);

  const value = {
    weeklyData,
    allData,
    isLoading,
    lastUpdated,
    error,
    fetchWeeklyData,
    fetchAllSensorData,
    fetchSensorHistorical,
    getSensorWeeklyData,
    clearCache,
  };

  return (
    <HistoricalDataContext.Provider value={value}>
      {children}
    </HistoricalDataContext.Provider>
  );
};