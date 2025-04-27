// AlertContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { ref, onValue, push } from "firebase/database";
import { sensor_db } from "../../../../../Firebase Database/FirebaseConfig"; // adjust if needed

const AlertContext = createContext();

const THRESHOLDS = {
  temperature: { min: 18, max: 35 },
  humidity: { min: 40, max: 80 },
  ph: { min: 5.5, max: 7.5 },
  tds: { min: 800, max: 1600 },
};

export const AlertProvider = ({ children }) => {
  const [activeAlerts, setActiveAlerts] = useState({});

  const checkLiveData = (entry) => {
    const now = new Date();
    const updatedActiveAlerts = { ...activeAlerts };
    const newIssues = [];
    const resolvedIssues = [];

    Object.entries(THRESHOLDS).forEach(([param, range]) => {
      const val = parseFloat(entry[param]);
      if (isNaN(val)) return;

      const isOutOfRange = val < range.min || val > range.max;
      const wasAlerting = !!activeAlerts[param];

      if (isOutOfRange) {
        if (!wasAlerting) {
          // New ALERT
          updatedActiveAlerts[param] = {
            timestamp: now.toISOString(),
            id: null, // will assign after push
          };
          newIssues.push({
            parameter: param,
            value: val,
            threshold: `${range.min}–${range.max}`,
            condition: val < range.min ? "LOW" : "HIGH",
          });
        }
      } else {
        if (wasAlerting) {
          // Now RESOLVED
          const startData = activeAlerts[param];
          const start = new Date(startData.timestamp);
          const durationMin = Math.round((now - start) / 60000);

          resolvedIssues.push({
            parameter: param,
            value: val,
            resolved: true,
            resolvedAt: now.toISOString(),
            durationMinutes: durationMin,
            range: `${range.min}–${range.max}`,
            condition: "NORMAL",
            triggeredId: startData.id,
          });

          delete updatedActiveAlerts[param];
        }
      }
    });

    // Push ALERTS if any
    if (newIssues.length > 0) {
      const alertEntry = {
        timestamp: now.toISOString(),
        issues: newIssues,
        raw: entry,
        status: "alert",
      };

      const newAlertRef = push(ref(sensor_db, "final_parameter_logs"), alertEntry);
      const alertId = newAlertRef.key;
      alertEntry.id = alertId;

      // Update active alerts with new alert ID
      newIssues.forEach((issue) => {
        if (updatedActiveAlerts[issue.parameter]) {
          updatedActiveAlerts[issue.parameter].id = alertId;
        }
      });
    }

    // Push RESOLVED if any
    if (resolvedIssues.length > 0) {
      const resolvedEntry = {
        timestamp: now.toISOString(),
        issues: resolvedIssues,
        raw: entry,
        status: "resolved",
      };

      push(ref(sensor_db, "final_parameter_logs"), resolvedEntry);
    }

    // Update activeAlerts memory
    setActiveAlerts(updatedActiveAlerts);
  };

  useEffect(() => {
    const sensorRef = ref(sensor_db, "predictions");

    const unsubscribe = onValue(sensorRef, (snapshot) => {
      if (snapshot.exists()) {
        const rawData = snapshot.val();
        const lastEntry = Object.values(rawData).pop();
        checkLiveData(lastEntry);
      }
    });

    return () => unsubscribe();
  }, [activeAlerts]); // include activeAlerts dependency

  return (
    <AlertContext.Provider value={{ activeAlerts }}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlert = () => useContext(AlertContext);
