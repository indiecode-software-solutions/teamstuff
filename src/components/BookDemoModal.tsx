import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { CheckCircle2, Calendar, Loader2 } from "lucide-react";

interface BookDemoModalProps {
  open: boolean;
  onClose: () => void;
  defaultTeamSize?: number;
}

export function BookDemoModal({ open, onClose, defaultTeamSize = 30 }: BookDemoModalProps) {
  const [selectedDay, setSelectedDay] = useState<string>("TUE 2");
  const [selectedTime, setSelectedTime] = useState<string>("3:30 PM");
  const [demoFormData, setDemoFormData] = useState({
    name: "",
    workEmail: "",
    phone: "",
    companyTeamSize: `${defaultTeamSize} employees`,
  });
  const [demoErrors, setDemoErrors] = useState<{ [key: string]: string }>({});
  const [isSubmittingDemo, setIsSubmittingDemo] = useState<boolean>(false);
  const [demoSubmitted, setDemoSubmitted] = useState<boolean>(false);

  // Available Days & Time Slots
  const demoDays = [
    { label: "MON 1", full: "Monday, 1 September" },
    { label: "TUE 2", full: "Tuesday, 2 September" },
    { label: "WED 3", full: "Wednesday, 3 September" },
    { label: "THU 4", full: "Thursday, 4 September" },
    { label: "FRI 5", full: "Friday, 5 September" },
  ];

  const demoTimes = ["10:00 AM", "11:30 AM", "2:00 PM", "3:30 PM", "5:00 PM"];

  const getFullDayName = (dayLabel: string) => {
    const found = demoDays.find((d) => d.label === dayLabel);
    return found ? found.full : dayLabel;
  };

  const validateEmail = (email: string): boolean => {
    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
  };

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};

    if (!selectedDay) {
      errors.day = "Please pick a day for the demo";
    }

    if (!selectedTime) {
      errors.time = "Please pick a time slot";
    }

    if (!demoFormData.name.trim()) {
      errors.name = "Please enter your full name";
    }

    if (!demoFormData.workEmail.trim()) {
      errors.workEmail = "Please enter your email";
    } else if (!validateEmail(demoFormData.workEmail)) {
      errors.workEmail = "Please enter a valid email address";
    }

    if (!demoFormData.phone.trim()) {
      errors.phone = "Please enter your contact phone";
    } else if (demoFormData.phone.trim().length < 8) {
      errors.phone = "Please enter a valid phone number";
    }

    if (Object.keys(errors).length > 0) {
      setDemoErrors(errors);
      return;
    }

    setDemoErrors({});
    setIsSubmittingDemo(true);

    setTimeout(() => {
      setIsSubmittingDemo(false);
      setDemoSubmitted(true);
    }, 1000);
  };

  const handleClose = () => {
    setDemoSubmitted(false);
    setSelectedDay("TUE 2");
    setSelectedTime("3:30 PM");
    setDemoFormData({
      name: "",
      workEmail: "",
      phone: "",
      companyTeamSize: `${defaultTeamSize} employees`,
    });
    setDemoErrors({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="book-demo-dialog-content">
        <DialogTitle className="sr-only">Book a free demo</DialogTitle>
        <DialogDescription className="sr-only">Schedule a demo walkthrough</DialogDescription>

        {demoSubmitted ? (
          /* Success Confirmation View */
          <div className="demo-success-wrap">
            <div className="demo-success-icon">
              <CheckCircle2 size={26} />
            </div>

            <h3 className="demo-success-title">
              Demo booked successfully!
            </h3>

            <p className="demo-success-desc">
              We've reserved <strong>{getFullDayName(selectedDay)} · {selectedTime}</strong> for you. An invite has been sent to <strong>{demoFormData.workEmail}</strong>.
            </p>

            <div className="demo-success-pill">
              <Calendar size={16} />
              <span>{getFullDayName(selectedDay)} at {selectedTime}</span>
            </div>

            <div>
              <button
                type="button"
                onClick={handleClose}
                className="demo-success-close-btn"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Booking Flow View */
          <form onSubmit={handleDemoSubmit}>
            {/* Modal Header */}
            <div className="demo-modal-header">
              <h3 className="demo-modal-title">
                Book a free demo
              </h3>
              <p className="demo-modal-subtitle">
                See Teamstuff in action. Pick a time that works for you.
              </p>
            </div>

            {/* Selected Slot Indicator */}
            <div className={`demo-slot-badge ${selectedDay && selectedTime ? "selected" : ""}`}>
              <Calendar size={15} />
              <span>
                {selectedDay && selectedTime
                  ? `${getFullDayName(selectedDay)} · ${selectedTime}`
                  : selectedDay
                  ? `${getFullDayName(selectedDay)} · (Pick a time below)`
                  : "Choose a day and time"}
              </span>
            </div>

            {/* 1. Pick a Day */}
            <div style={{ marginBottom: "14px" }}>
              <div className="demo-section-label">
                <span>1. Pick a day</span>
                {demoErrors.day && <span className="demo-section-error">{demoErrors.day}</span>}
              </div>
              <div className="demo-day-grid">
                {demoDays.map((day) => {
                  const isSelected = selectedDay === day.label;
                  return (
                    <button
                      key={day.label}
                      type="button"
                      onClick={() => {
                        setSelectedDay(day.label);
                        if (demoErrors.day) setDemoErrors({ ...demoErrors, day: "" });
                      }}
                      className={`demo-day-btn ${isSelected ? "active" : ""}`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Pick a Time */}
            <div style={{ marginBottom: "14px" }}>
              <div className="demo-section-label">
                <span>2. Pick a time</span>
                {demoErrors.time && <span className="demo-section-error">{demoErrors.time}</span>}
              </div>
              <div className="demo-time-grid">
                {demoTimes.map((time) => {
                  const isSelected = selectedTime === time;
                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => {
                        setSelectedTime(time);
                        if (demoErrors.time) setDemoErrors({ ...demoErrors, time: "" });
                      }}
                      className={`demo-time-btn ${isSelected ? "active" : ""}`}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="demo-divider" />

            {/* 3. Your Details */}
            <div>
              <div className="demo-section-label" style={{ marginBottom: "12px" }}>
                <span>Your contact details</span>
              </div>

              {/* Full Name */}
              <div className="demo-field-group">
                <label className="demo-field-label">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={demoFormData.name}
                  onChange={(e) => {
                    setDemoFormData({ ...demoFormData, name: e.target.value });
                    if (demoErrors.name) setDemoErrors({ ...demoErrors, name: "" });
                  }}
                  className={`demo-field-input ${demoErrors.name ? "error" : ""}`}
                />
                {demoErrors.name && <p className="demo-field-error">{demoErrors.name}</p>}
              </div>

              {/* Work Email */}
              <div className="demo-field-group">
                <label className="demo-field-label">Work Email</label>
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={demoFormData.workEmail}
                  onChange={(e) => {
                    setDemoFormData({ ...demoFormData, workEmail: e.target.value });
                    if (demoErrors.workEmail) setDemoErrors({ ...demoErrors, workEmail: "" });
                  }}
                  className={`demo-field-input ${demoErrors.workEmail ? "error" : ""}`}
                />
                {demoErrors.workEmail && <p className="demo-field-error">{demoErrors.workEmail}</p>}
              </div>

              {/* Phone Number */}
              <div className="demo-field-group">
                <label className="demo-field-label">Phone Number</label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={demoFormData.phone}
                  onChange={(e) => {
                    setDemoFormData({ ...demoFormData, phone: e.target.value });
                    if (demoErrors.phone) setDemoErrors({ ...demoErrors, phone: "" });
                  }}
                  className={`demo-field-input ${demoErrors.phone ? "error" : ""}`}
                />
                {demoErrors.phone && <p className="demo-field-error">{demoErrors.phone}</p>}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmittingDemo}
                className="demo-submit-btn"
              >
                {isSubmittingDemo ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Reserving slot...</span>
                  </>
                ) : (
                  <span>Book My Demo →</span>
                )}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
