package org.itstec.common.security;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class SHA256Util {
	
	private static Logger logger = LoggerFactory.getLogger(SHA256Util.class);
	
    public static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] result = digest.digest(input.getBytes());
            StringBuilder sb = new StringBuilder();
            for (byte b : result) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
        	logger.error("sha256异常:"+e.getMessage());
            return null;
        }
    }
    
    public static String sha256WithSalt(String input, String salt) {
    	String data = input + salt; 
    	return sha256(data);
    }
    
}
