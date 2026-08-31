// src/context/NetworkContext.jsx
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "./ThemContext";

const NetworkContext = createContext(undefined);

export const NetworkProvider = ({ children }) => {
  const { theme } = useTheme();
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const previousStateRef = useRef({ isConnected: true, isInternetReachable: true });
  const modalTimeoutRef = useRef(null);

  // ── Check network on mount ──
  useEffect(() => {
    const checkInitialNetwork = async () => {
      try {
        const state = await NetInfo.fetch();
        const connected = state.isConnected && state.isInternetReachable !== false;
        setIsConnected(connected);
        setIsInternetReachable(state.isInternetReachable !== false);
        previousStateRef.current = {
          isConnected: connected,
          isInternetReachable: state.isInternetReachable !== false,
        };
        
        if (!connected) {
          setShowModal(true);
        }
      } catch (error) {
        console.error("❌ Network check error:", error);
        setIsConnected(false);
        setShowModal(true);
      }
    };
    
    checkInitialNetwork();
  }, []);

  // ── Listen to network changes ──
  useEffect(() => {
    let unsubscribe = null;
    let reconnectTimeout = null;

    const setupListener = () => {
      unsubscribe = NetInfo.addEventListener((state) => {
        const connected = state.isConnected && state.isInternetReachable !== false;
        const wasConnected = previousStateRef.current.isConnected;

        console.log(`📶 Network: connected=${connected}`);

        setIsConnected(connected);
        setIsInternetReachable(state.isInternetReachable !== false);

        if (!connected && wasConnected) {
          console.log("🔴 Network lost - showing modal");
          setShowModal(true);
          
          if (modalTimeoutRef.current) {
            clearTimeout(modalTimeoutRef.current);
            modalTimeoutRef.current = null;
          }
        }

        if (connected && !wasConnected) {
          console.log("🟢 Network restored - hiding modal after delay");
          
          if (modalTimeoutRef.current) {
            clearTimeout(modalTimeoutRef.current);
            modalTimeoutRef.current = null;
          }
          
          modalTimeoutRef.current = setTimeout(() => {
            setShowModal(false);
            modalTimeoutRef.current = null;
          }, 1500);
        }

        previousStateRef.current = {
          isConnected: connected,
          isInternetReachable: state.isInternetReachable !== false,
        };
      });
    };

    setupListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      if (modalTimeoutRef.current) {
        clearTimeout(modalTimeoutRef.current);
        modalTimeoutRef.current = null;
      }
    };
  }, []);

  // ── Manual retry ──
  const handleRetry = async () => {
    if (isChecking) return;
    
    setIsChecking(true);
    try {
      const state = await NetInfo.fetch();
      const connected = state.isConnected && state.isInternetReachable !== false;
      
      if (connected) {
        setShowModal(false);
      }
    } catch (error) {
      console.error("❌ Retry failed:", error);
    } finally {
      setIsChecking(false);
    }
  };

  // ── Dismiss modal ──
  const dismissModal = () => {
    if (isConnected && isInternetReachable) {
      setShowModal(false);
    }
  };

  return (
    <NetworkContext.Provider
      value={{
        isConnected,
        isInternetReachable,
        showModal,
        setShowModal,
        handleRetry,
        dismissModal,
        isChecking,
      }}
    >
      {children}
      
      {/* ── Google Style Network Modal ── */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dismissModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.colors.surface }]}>
            
            {/* ── Google Style Icon ── */}
            <View style={styles.iconWrapper}>
              <View style={[styles.iconCircle, { backgroundColor: `${theme.colors.error}12` }]}>
                <Ionicons name="wifi-outline" size={48} color={theme.colors.error} />
                <View style={[styles.slashLine, { backgroundColor: theme.colors.error }]} />
              </View>
            </View>

            {/* ── Title ── */}
            <Text style={[styles.title, { color: theme.colors.text }]}>
              No internet connection
            </Text>

            {/* ── Description ── */}
            <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
              Looks like you're not connected to the internet. Please check your connection and try again.
            </Text>

            {/* ── Try Again Button (Google Style) ── */}
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetry}
              disabled={isChecking}
              activeOpacity={0.7}
            >
              <Text style={[styles.retryButtonText, { color: theme.colors.primary }]}>
                {isChecking ? 'Checking...' : 'Try again'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return context;
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    borderRadius: 28,
    padding: 32,
    paddingTop: 36,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 40,
    elevation: 24,
  },

  // ── Google Style Icon ──
  iconWrapper: {
    marginBottom: 20,
    position: 'relative',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  slashLine: {
    position: 'absolute',
    width: 3,
    height: 44,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
    top: 18,
    left: 38.5,
  },

  // ── Text Styles ──
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
    paddingHorizontal: 4,
    opacity: 0.8,
  },

  // ── Google Style Button ──
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 24,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});