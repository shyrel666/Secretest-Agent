package org.itstec.common.security;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Random;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class SecUtil {
	
	private static Logger logger = LoggerFactory.getLogger(SecUtil.class);

	private static SecretKeySpec secretKey;

	static {
        try {
            String tp = "PTTY6C+vpJO+5sYa/Mvx5g==";
            secretKey = new SecretKeySpec(tp.getBytes(StandardCharsets.UTF_8), "AES");
        } catch (Exception e) {
        	logger.error("SecUtil初始化异常:"+e.getMessage());
        }
    }
	
	public static String encrypt(String plainText) {
        try {
            byte[] iv = new byte[12]; 
            Random random = new Random();
            random.nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(128, iv));
            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

            byte[] combined = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);

            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
        	logger.error("SecUtil加密异常:"+e.getMessage());
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
        	logger.error("SecUtil解密异常:"+e.getMessage());
            return null;
        }
    }

}
