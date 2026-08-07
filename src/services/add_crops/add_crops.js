// src/services/add_crops/add_crops.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from 'axios';
const BASE_URL = process.env.EXPO_PUBLIC_cIp_URL;


// ============================================
// GET ALL CROPS - List all crops
// ============================================
export const getAllCrops = async () => {
  try {
    const authToken = await AsyncStorage.getItem("authToken");
    
    const response = await axios.get(`${BASE_URL}/crops/list/`, {
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    return {
      success: true,
      data: response.data,
      message: 'Crops fetched successfully'
    };
  } catch (error) {
    console.error('Error fetching crops:', error);
    return {
      success: false,
      data: [],
      message: error.response?.data?.message || error.message || 'Failed to fetch crops'
    };
  }
};

// ============================================
// GET PARAMETERS BY CROP NAME
// ============================================
export const getParametersByCropName = async (cropName) => {
  try {
    const authToken = await AsyncStorage.getItem("authToken");
    
    const response = await axios.get(`${BASE_URL}/crops/`, {
      params: { crop_name: cropName },
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    // Response format: [{ parameter_id, crop_name, crop_variety_name, stage_id }]
    return {
      success: true,
      data: response.data,
      message: 'Data fetched successfully'
    };
  } catch (error) {
    console.error('Error fetching crop parameters:', error);
    return {
      success: false,
      data: [],
      message: error.response?.data?.message || error.message || 'Failed to fetch crop parameters'
    };
  }
};

// ============================================
// GET PARAMETER BY ID - Full crop details
// ============================================
export const getParameterById = async (parameterId) => {
  try {
    const authToken = await AsyncStorage.getItem("authToken");
    
    const response = await axios.get(`${BASE_URL}/crops/${parameterId}/`, {
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    return {
      success: true,
      data: response.data,
      message: 'Data fetched successfully'
    };
  } catch (error) {
    console.error('Error fetching parameter by ID:', error);
    return {
      success: false,
      data: null,
      message: error.response?.data?.message || error.message || 'Failed to fetch crop details'
    };
  }
};

// ============================================
// GET PARAMETER BY ID (Legacy - keep for compatibility)
// ============================================
export const cropsData = async (id) => {
  return getParameterById(id);
};

// ============================================
// GET ALL PARAMETERS
// ============================================
export const getAllParameters = async (page = 1, limit = 100) => {
  
  try {
    const authToken = await AsyncStorage.getItem("authToken");
    
    const response = await axios.get(`${BASE_URL}/parameters`, {
      params: { page, limit },
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    return {
      success: true,
      data: response.data.data,
      pagination: response.data.pagination,
      message: 'Data fetched successfully'
    };
  } catch (error) {
    console.error('Error fetching parameters:', error);
    return {
      success: false,
      data: [],
      message: error.message
    };
  }
};

// ============================================
// GET PARAMETERS BY CROP AND STAGE
// ============================================
export const getParametersByCropAndStage = async (cropName, stageId) => {
  try {
    const authToken = await AsyncStorage.getItem("authToken");
    
    const response = await axios.get(
      `${BASE_URL}/parameters/crop/${cropName}/stage/${stageId}`,
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    
    return {
      success: true,
      data: response.data.data,
      message: 'Data fetched successfully'
    };
  } catch (error) {
    console.error('Error fetching crop stage parameters:', error);
    return {
      success: false,
      data: [],
      message: error.message
    };
  }
};

// ============================================
// SEARCH PARAMETERS WITH FILTERS
// ============================================
export const searchParameters = async (filters = {}) => {
  try {
    const authToken = await AsyncStorage.getItem("authToken");
    
    const response = await axios.get(`${BASE_URL}/parameters/search`, {
      params: filters,
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    return {
      success: true,
      data: response.data.data,
      count: response.data.count,
      message: 'Search completed successfully'
    };
  } catch (error) {
    console.error('Error searching parameters:', error);
    return {
      success: false,
      data: [],
      message: error.message
    };
  }
};

// ============================================
// GET VARIETIES BY CROP
// ============================================
export const getVarietiesByCrop = async (cropName) => {
  try {
    const authToken = await AsyncStorage.getItem("authToken");
    
    const response = await axios.get(`${BASE_URL}/crops/${cropName}/varieties`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    return {
      success: true,
      data: response.data.data,
      message: 'Varieties fetched successfully'
    };
  } catch (error) {
    console.error('Error fetching varieties:', error);
    return {
      success: false,
      data: [],
      message: error.message
    };
  }
};