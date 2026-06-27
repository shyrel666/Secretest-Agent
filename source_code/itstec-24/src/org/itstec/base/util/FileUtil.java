
package org.itstec.base.util;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;


public class FileUtil {

	private static FileUtil fileunit = null;

    private FileUtil() {

    }

    public static FileUtil getInstance() {
        if (null == fileunit) {
            return new FileUtil();
        } else {
            return fileunit;
        }
    }

    public boolean isFile(String filepath){
    	try {
            File file = new File(filepath);
            return file.isFile();
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean isFolder(String folderPath){
    	try {
            File file = new File(folderPath);
            return file.isDirectory();
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public String[][] showFolder(String folderPath){
    	File file = new File(folderPath);
    	File[] subs = file.listFiles();
    	int m=0,n=0;
    	String [][] folder = new String [2][subs.length];
    	for(int i=0;i<subs.length;i++){
    		if(subs[i].isDirectory()){
    			folder[0][m]=subs[i].getName();
    			m++;
    		}else{
    			folder[1][n]=subs[i].getName();
    			n++;
    		}
    	}
    	return folder;
    }

    public boolean makeFile(String filepath) throws IOException {
        try {
            File file = new File(filepath);
            return file.createNewFile();
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean createFolder(String folderPath) {
        try {
            File f = new File(folderPath);
            return f.mkdirs();
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public boolean copyFile(String copyFile , String copyToFile) throws Exception {
    	FileOutputStream fileOUT = null;
    	FileInputStream fileIO = null;
        try {
            File file = new File(copyFile);

            fileIO = new FileInputStream(file);

            fileOUT = new FileOutputStream(copyToFile);
            int bytesRead = 0;
            byte[] buffer = new byte[8192];
            while ((bytesRead = fileIO.read(buffer, 0, 8192)) != -1) {
                // 将文件写入服务器
                fileOUT.write(buffer, 0, bytesRead);
            }
           
            fileOUT.close();
            fileIO.close();
            
            return true;
        } catch (FileNotFoundException fe) {
            throw new FileNotFoundException (copyToFile + "此文件目录找不到!");
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

}
