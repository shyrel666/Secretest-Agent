package org.itstec.report.entity;

public class Report {
	
	private String id;
	private String userId;
	private String doctorId;
	private double bloodPressure; 
	private double bloodSugar; 
	private double bloodLipids;
	private String dateTime;
	
	public String getDateTime() {
		return dateTime;
	}
	public void setDateTime(String dateTime) {
		this.dateTime = dateTime;
	}
	public String getId() {
		return id;
	}
	public void setId(String id) {
		this.id = id;
	}
	public String getUserId() {
		return userId;
	}
	public void setUserId(String userId) {
		this.userId = userId;
	}
	public String getDoctorId() {
		return doctorId;
	}
	public void setDoctorId(String doctorId) {
		this.doctorId = doctorId;
	}
	public double getBloodPressure() {
		return bloodPressure;
	}
	public void setBloodPressure(double bloodPressure) {
		this.bloodPressure = bloodPressure;
	}
	public double getBloodSugar() {
		return bloodSugar;
	}
	public void setBloodSugar(double bloodSugar) {
		this.bloodSugar = bloodSugar;
	}
	public double getBloodLipids() {
		return bloodLipids;
	}
	public void setBloodLipids(double bloodLipids) {
		this.bloodLipids = bloodLipids;
	}

}
