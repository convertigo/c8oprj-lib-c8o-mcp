/*
 * The engine's own YAML codec, driven from tests/scripts/test_c8o_yaml_standard.py to compare the Python
 * reader and writer of scripts/c8o_yaml_standard.py with it. Run with the Java single-file launcher and an
 * engine built with the standard YAML format (8.5):
 *
 *   java -cp "<engine jar>:<dependencies jar>" tests/scripts/StandardYamlOracle.java <command> ...
 *
 *   convert <legacy project> <out>  reads a legacy project and writes it in the standard format, each
 *                                   bean kept in its source file (codec only: no bean migration)
 *   dump <project>                  prints the element tree the engine reads (any format)
 *   write <records> <out>           builds the tree of a records file and writes it in the standard format
 *
 * Records, one node per line, each string as '_' + Base64(UTF-8): E tag [namespace] starts an element,
 * '/' ends it, A name value an attribute, Q name namespace value a namespaced one, F path the source file
 * of a bean, T text, C CDATA, M comment, P target data.
 */

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Deque;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;

import com.twinsoft.convertigo.engine.util.XMLUtils;
import com.twinsoft.convertigo.engine.util.YamlConverter;

public class StandardYamlOracle {
	private static String enc(String s) {
		return "_" + Base64.getEncoder().encodeToString(s.getBytes(StandardCharsets.UTF_8));
	}

	private static String dec(String s) {
		return new String(Base64.getDecoder().decode(s.substring(1)), StandardCharsets.UTF_8);
	}

	private static void dump(Node node, StringBuilder out) {
		switch (node.getNodeType()) {
			case Node.ELEMENT_NODE -> {
				Element element = (Element) node;
				out.append("E ").append(enc(element.getTagName()));
				if (element.getNamespaceURI() != null) out.append(' ').append(enc(element.getNamespaceURI()));
				out.append('\n');
				var attributes = element.getAttributes();
				for (int i = 0; i < attributes.getLength(); i++) {
					Node attribute = attributes.item(i);
					if (attribute.getNodeName().equals("yaml_file") && element.getTagName().equals("bean")) continue;
					if (attribute.getNamespaceURI() == null) {
						out.append("A ").append(enc(attribute.getNodeName())).append(' ').append(enc(attribute.getNodeValue())).append('\n');
					} else {
						out.append("Q ").append(enc(attribute.getNodeName())).append(' ').append(enc(attribute.getNamespaceURI()))
								.append(' ').append(enc(attribute.getNodeValue())).append('\n');
					}
				}
				String file = element.getAttribute("yaml_file");
				if (file.isEmpty() && element.getUserData("convertigo.yaml.file") instanceof String stored) file = stored;
				if (element.getTagName().equals("bean") && !file.isEmpty()) out.append("F ").append(enc(file)).append('\n');
				for (Node child = node.getFirstChild(); child != null; child = child.getNextSibling()) dump(child, out);
				out.append("/\n");
			}
			case Node.TEXT_NODE -> out.append("T ").append(enc(node.getNodeValue())).append('\n');
			case Node.CDATA_SECTION_NODE -> out.append("C ").append(enc(node.getNodeValue())).append('\n');
			case Node.COMMENT_NODE -> out.append("M ").append(enc(node.getNodeValue())).append('\n');
			case Node.PROCESSING_INSTRUCTION_NODE -> out.append("P ").append(enc(node.getNodeName())).append(' ')
					.append(enc(node.getNodeValue())).append('\n');
			default -> throw new IllegalStateException("node type " + node.getNodeType());
		}
	}

	private static Document build(Path records) throws Exception {
		Document document = XMLUtils.createDom();
		Deque<Node> stack = new ArrayDeque<>();
		stack.push(document);
		for (String line : Files.readAllLines(records, StandardCharsets.UTF_8)) {
			if (line.isEmpty()) continue;
			String[] t = line.split(" ");
			Node parent = stack.peek();
			switch (t[0]) {
				case "E" -> {
					Element element = t.length > 2 ? document.createElementNS(dec(t[2]), dec(t[1])) : document.createElement(dec(t[1]));
					parent.appendChild(element);
					stack.push(element);
				}
				case "/" -> stack.pop();
				case "A" -> ((Element) parent).setAttribute(dec(t[1]), dec(t[2]));
				case "Q" -> ((Element) parent).setAttributeNS(dec(t[2]), dec(t[1]), dec(t[3]));
				case "F" -> ((Element) parent).setAttribute("yaml_file", dec(t[1]));
				case "T" -> parent.appendChild(document.createTextNode(dec(t[1])));
				case "C" -> parent.appendChild(document.createCDATASection(dec(t[1])));
				case "M" -> parent.appendChild(document.createComment(dec(t[1])));
				case "P" -> parent.appendChild(document.createProcessingInstruction(dec(t[1]), dec(t[2])));
				default -> throw new IllegalArgumentException(line);
			}
		}
		YamlConverter.setFormat(document, YamlConverter.Format.STANDARD);
		return document;
	}

	/** The legacy reader inlines the 🗏 sources without recording them (a save takes them from the beans):
	 * find the file of each bean path (yaml keys from the top) in the legacy text, outside '|' blocks. */
	private static java.util.Map<String, String> legacySources(Path project) throws Exception {
		var sources = new java.util.HashMap<String, String>();
		var pattern = java.util.regex.Pattern.compile("( *)(- )?↓(.*?): (🗏 )?(.*)");
		Deque<Object[]> files = new ArrayDeque<>();
		files.add(new Object[] { project.resolve("c8oProject.yaml"), "" });
		while (!files.isEmpty()) {
			Object[] item = files.poll();
			Deque<Object[]> stack = new ArrayDeque<>();
			int block = -1;
			for (String line : Files.readAllLines((Path) item[0], StandardCharsets.UTF_8)) {
				int indent = 0;
				while (indent < line.length() && line.charAt(indent) == ' ') indent++;
				if (block >= 0 && indent > block) continue;
				block = line.endsWith(": |") ? indent : -1;
				var match = pattern.matcher(line);
				if (block >= 0 || !match.matches()) continue;
				while (!stack.isEmpty() && (int) stack.peek()[0] >= indent) stack.pop();
				String path = (stack.isEmpty() ? (String) item[1] : (String) stack.peek()[1]) + "\u0000" + match.group(3);
				stack.push(new Object[] { indent, path });
				if (match.group(4) != null) {
					sources.put(path, match.group(5));
					files.add(new Object[] { project.resolve("_c8oProject").resolve(match.group(5)), path });
				}
			}
		}
		return sources;
	}

	private static void attachSources(Element element, String path, java.util.Map<String, String> sources) {
		for (Node child = element.getFirstChild(); child != null; child = child.getNextSibling()) {
			if (child instanceof Element bean && bean.getTagName().equals("bean")) {
				String beanPath = path + "\u0000" + bean.getAttribute("yaml_key");
				if (sources.containsKey(beanPath)) bean.setAttribute("yaml_file", sources.get(beanPath));
				attachSources(bean, beanPath, sources);
			}
		}
	}

	private static void write(Document document, Path out) throws Exception {
		Files.createDirectories(out);
		File yaml = out.resolve("c8oProject.yaml").toFile();
		YamlConverter.writeYaml(document, yaml, out.resolve("_c8oProject").toFile());
	}

	public static void main(String[] args) throws Exception {
		switch (args[0]) {
			case "convert" -> {
				Document document = YamlConverter.readYaml(Path.of(args[1], "c8oProject.yaml").toFile());
				Element root = document.getDocumentElement();
				attachSources(root, "", legacySources(Path.of(args[1])));
				root.setAttribute("convertigo", YamlConverter.minimumVersion(root.getAttribute("convertigo"), YamlConverter.Format.STANDARD));
				YamlConverter.setFormat(document, YamlConverter.Format.STANDARD);
				write(document, Path.of(args[2]));
			}
			case "dump" -> {
				var out = new StringBuilder();
				dump(YamlConverter.readYaml(Path.of(args[1], "c8oProject.yaml").toFile()).getDocumentElement(), out);
				System.out.write(out.toString().getBytes(StandardCharsets.UTF_8));
				System.out.flush();
			}
			case "write" -> write(build(Path.of(args[1])), Path.of(args[2]));
			default -> throw new IllegalArgumentException(args[0]);
		}
	}
}
