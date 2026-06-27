package org.itstec.log.service.impl;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.file.FileSystems;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.PathMatcher;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;

import org.itstec.base.util.DateUtil;
import org.itstec.base.util.FileUtil;
import org.itstec.base.util.ZipUtils;
import org.itstec.common.result.R;
import org.itstec.log.service.LogService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.ResourceUtils;

@Service
public class LogServiceImpl implements LogService{

	private Logger logger = LoggerFactory.getLogger(LogServiceImpl.class);
	
	@Override
	public R<?> show(String logPath) {
		boolean f = false;
		f=FileUtil.getInstance().isFolder(logPath);
		String showContent="<tr bgColor='#FFFFFF'><td colspan=2>";
		if(f){
			String[][] s=FileUtil.getInstance().showFolder(logPath);
			boolean t=false;
			for(int i=0;i<s[0].length;i++){
				if(s[0][i]!=null){
					showContent+="&nbsp;&nbsp;子目录:&nbsp;&nbsp;<a href='#' onclick=_showFolderByHref('"+s[0][i]+"') >/"+s[0][i]+"</a><br>";
					t=true;
				}
			}
			for(int i=0;i<s[1].length;i++){
				if(s[1][i]!=null){
					showContent+="&nbsp;&nbsp;文&nbsp;&nbsp;&nbsp;&nbsp;件:&nbsp;&nbsp;"+s[1][i]+"<br>";
					t=true;
				}
			}
			if(!t){
				showContent+="&nbsp;&nbsp;该目录下没有子目录和文件存在<br>";
			}
			showContent+="</td></tr>";
		}else{
			return R.code("200","输入的查看目录不存在，请核实！");
		}

		return R.code("200",showContent);
	}

	@Override
	public R<?> logGrab(String logPath) {
        String downPath="";
		String fileName=DateUtil.getDateTimeStr();
		try {
			downPath = ResourceUtils.getURL("classpath:").getPath();
			FileUtil fileUtil = FileUtil.getInstance();
			ZipUtils obj = new ZipUtils(logPath+"/"+fileName+".zip");
	    	obj.compress(logPath); 
	    	
			fileUtil.copyFile(logPath+"/"+fileName+".zip",downPath+fileName+".zip");
			logger.info("fileName: "+fileName+".zip");
		}catch (Exception e) {
			logger.error("日志抓取异常：", e);
		}
		
		return R.code("200",downPath+fileName);
	}

	@Override
	public R<?> logQuickArch() {
		String[] cmd = new String[3];
		cmd[0] = "cmd.exe";
		cmd[1] = "/c";
		cmd[2] = "";
		try {
			cmd[2]=match("glob:**/logQuickArch.bat","D:/itstec");
			Process process = Runtime.getRuntime().exec(cmd);
			execute(process.getInputStream());
		} catch (Exception e) {
			logger.error("日志归档异常：", e);
			return R.code("200","日志归档异常"+e);
		}
		
		return R.code("200","归档成功");
	}
	
	@Override
	public R<?> logArch(String para) {
		String[] cmd = new String[3];
		cmd[0] = "cmd.exe";
		cmd[1] = "/c";
		cmd[2] = "D:/itstec/logArch.bat";
		try {
			cmd[2]=cmd[2]+" "+para;
			Process process = Runtime.getRuntime().exec(cmd);
			execute(process.getInputStream());
		} catch (Exception e) {
			logger.error("日志归档异常：", e);
			return R.code("200","日志归档异常"+e);
		}
		
		return R.code("200","归档成功");
	}

	private static String match(String glob, String location) throws IOException {
	    StringBuilder result = new StringBuilder();
	    PathMatcher pathMatcher = FileSystems.getDefault().getPathMatcher(glob);
	    Files.walkFileTree(Paths.get(location), new SimpleFileVisitor<Path>() {

	        @Override
	        public FileVisitResult visitFile(Path path, BasicFileAttributes attrs) throws IOException {
	            if (pathMatcher.matches(path)) {
	                result.append(path.toString());
	                return FileVisitResult.TERMINATE;
	            }
	            return FileVisitResult.CONTINUE;
	        }
	    });

	    return result.toString();
	}

	private static void execute(final InputStream input) {
		Thread th= new Thread(new Runnable() {
			public void run() {
				Reader reader = new InputStreamReader(input);
				BufferedReader bf = new BufferedReader(reader);
				String line = null;
				try {
					while ((line = bf.readLine()) != null) {
						System.out.println(line);
					}
				} catch (IOException e) {
					e.printStackTrace();
				}
			}
		});
		th.start();
		th.interrupt();
	}
	
}
