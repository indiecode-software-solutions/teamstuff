import React, { useState } from "react";
import {
  Calculator,
  Route,
  Receipt,
  Car,
  Bike,
  Bus,
  Sparkles,
  ArrowRight,
  CheckCircle,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { TRAVEL_MODES, TravelModeKey } from "../lib/site-visits";

interface OdometerCalculatorCardProps {
  onClaimExpense?: (claimData: {
    distanceKm: number;
    travelMode: string;
    ratePerKm: number;
    amount: number;
    title: string;
    notes: string;
  }) => void;
  isSubmitting?: boolean;
}

export default function OdometerCalculatorCard({
  onClaimExpense,
  isSubmitting = false,
}: OdometerCalculatorCardProps) {
  const [startOdo, setStartOdo] = useState<string>("");
  const [endOdo, setEndOdo] = useState<string>("");
  const [manualKm, setManualKm] = useState<string>("");
  const [travelMode, setTravelMode] = useState<TravelModeKey>("two_wheeler");
  const [customRate, setCustomRate] = useState<string>("");
  const [claimTitle, setClaimTitle] = useState<string>("Client Travel Reimbursement");

  // Determine active rate
  const selectedModeConfig = TRAVEL_MODES.find((m) => m.id === travelMode);
  const activeRate = customRate ? parseFloat(customRate) || 0 : selectedModeConfig?.defaultRate || 0;

  // Calculate distance
  const startNum = parseFloat(startOdo);
  const endNum = parseFloat(endOdo);
  let computedKm = 0;

  if (!isNaN(startNum) && !isNaN(endNum) && endNum >= startNum) {
    computedKm = Math.round((endNum - startNum) * 100) / 100;
  } else if (manualKm && !isNaN(parseFloat(manualKm))) {
    computedKm = Math.round(parseFloat(manualKm) * 100) / 100;
  }

  const totalReimbursement = Math.round(computedKm * activeRate * 100) / 100;

  const handleClaim = () => {
    if (computedKm <= 0 || totalReimbursement <= 0) return;
    if (onClaimExpense) {
      onClaimExpense({
        distanceKm: computedKm,
        travelMode: travelMode,
        ratePerKm: activeRate,
        amount: totalReimbursement,
        title: claimTitle || `Travel Claim (${computedKm} km)`,
        notes: `Auto-calculated via Odometer Calculator: ${computedKm} km @ ₹${activeRate}/km using ${travelMode.replace("_", " ")}.`,
      });
    }
  };

  return (
    <div >
      {/* Header */}
      <div >
        <div >
          <div >
            <Calculator size={16} />
          </div>
          <div>
            <p >
              Mileage & Expense Calculator
            </p>
            <p >
              Calculate travel reimbursement using approved mileage rates
            </p>
          </div>
        </div>

        <span >
          Direct Claim
        </span>
      </div>

      {/* Body Content */}
      <div >
        {/* 1. Travel Mode Selector */}
        <div>
          <p >
            Vehicle Mode
          </p>
          <div >
            {TRAVEL_MODES.map((mode) => {
              const isSelected = travelMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setTravelMode(mode.id);
                    setCustomRate("");
                  }}
                  className={`${ isSelected ? "" : "" }`}
                >
                  <p >
                    {mode.label.split("/")[0]}
                  </p>
                  <p className={`${isSelected ? "" : ""}`}>
                    ₹{mode.defaultRate}/km
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Odometer / Distance Inputs */}
        <div >
          <div>
            <label >
              Start Odometer (km)
            </label>
            <input
              type="number"
              placeholder="e.g. 15400"
              value={startOdo}
              onChange={(e) => {
                setStartOdo(e.target.value);
                setManualKm("");
              }}
              
            />
          </div>
          <div>
            <label >
              End Odometer (km)
            </label>
            <input
              type="number"
              placeholder="e.g. 15438"
              value={endOdo}
              onChange={(e) => {
                setEndOdo(e.target.value);
                setManualKm("");
              }}
              
            />
          </div>
          <div>
            <label >
              Or Direct Distance (km)
            </label>
            <input
              type="number"
              placeholder="e.g. 38.5"
              value={manualKm}
              onChange={(e) => {
                setManualKm(e.target.value);
                setStartOdo("");
                setEndOdo("");
              }}
              
            />
          </div>
        </div>

        {/* 3. Output Display Banner */}
        <div className={`${ computedKm > 0 ? "" : "" }`}>
          <div >
            <div>
              <span >
                Distance
              </span>
              <span >
                {computedKm.toFixed(1)} <span >km</span>
              </span>
            </div>

            <div>
              <span >
                Rate
              </span>
              <span >
                ₹{activeRate} <span >/km</span>
              </span>
            </div>

            <div>
              <span >
                Total Reimbursement
              </span>
              <span >
                ₹{totalReimbursement.toFixed(2)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClaim}
            disabled={computedKm <= 0 || totalReimbursement <= 0 || isSubmitting}
            
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16}  />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <Receipt size={16} />
                <span>Submit Travel Claim</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
