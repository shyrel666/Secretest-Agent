package org.itstec.common.security;

import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Properties;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class AESUtil {

	private static Logger logger = LoggerFactory.getLogger(AESUtil.class);
	
	private static SecretKeySpec secretKey;

	static {
        try {
            Properties prop = new Properties();
            FileInputStream input = new FileInputStream("D:\\itstec\\aes.properties");
            prop.load(input);
            input.close();
            String key = prop.getProperty("key");
            secretKey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES");
        } catch (Exception e) {
        	logger.error("AES初始化异常:"+e.getMessage());
        }
    }

	public static String generateKey() throws Exception {
		KeyGenerator keyGenerator = KeyGenerator.getInstance("AES");
		keyGenerator.init(128);
		return Base64.getEncoder().encodeToString(secretKey.getEncoded());
    }
	
	public static String encrypt(String plainText) {
        try {
        	byte[] iv = {7, 9, 8, 1, 2, 3, 5, 66, 88, 10, 11, 12};

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(128, iv));
            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

            byte[] combined = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);

            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
        	logger.error("AES加密异常:"+e.getMessage());
            return null;
        }
    }

    public static String decrypt(String cipherText) {
        try {
            byte[] combined = Base64.getDecoder().decode(cipherText);
            byte[] iv = new byte[12];
            byte[] encrypted = new byte[combined.length - 12];
            System.arraycopy(combined, 0, iv, 0, 12);
            System.arraycopy(combined, 12, encrypted, 0, combined.length - 12);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(128, iv));
            byte[] decrypted = cipher.doFinal(encrypted);

            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
        	logger.error("AES解密异常:"+e.getMessage());
            return null;
        }
    }
	
	public static String encrypt(String plainText, String key) {
        try {
        	SecretKeySpec skey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES");
        	
            byte[] iv = new byte[12]; 
            SecureRandom random = new SecureRandom();
            random.nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, skey, new GCMParameterSpec(128, iv));
            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

            byte[] combined = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);

            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
        	logger.error("AES加密异常:"+e.getMessage());
            return null;
        }
    }
	
	public static String decrypt(String cipherText, String key) {
        try {
        	SecretKeySpec skey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES");
        	
            byte[] combined = Base64.getDecoder().decode(cipherText);
            byte[] iv = new byte[12];
            byte[] encrypted = new byte[combined.length - 12];
            System.arraycopy(combined, 0, iv, 0, 12);
            System.arraycopy(combined, 12, encrypted, 0, combined.length - 12);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, skey, new GCMParameterSpec(128, iv));
            byte[] decrypted = cipher.doFinal(encrypted);

            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
        	logger.error("AES解密异常:"+e.getMessage());
            return null;
        }
    }

}
