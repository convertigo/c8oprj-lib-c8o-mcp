import java.nio.file.Files;
import java.nio.file.Path;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Scriptable;

/** Execute the compatibility checks against the real engine parser, without a Studio. */
public class RhinoLoopBindingsTest {
    public static void main(String[] args) throws Exception {
        Path root = Path.of(args[0]);
        for (int optimization : new int[] {-1, 0, 9}) {
            try (Context cx = Context.enter()) {
                cx.setLanguageVersion(Context.VERSION_ES6);
                cx.setOptimizationLevel(optimization);
                Scriptable scope = cx.initStandardObjects();
                String helper = Files.readString(root.resolve("js/rhino_loop_bindings.js"));
                cx.evaluateString(scope, helper, "rhino_loop_bindings.js", 1, null);
                if (args.length > 1 && args[1].equals("--baseline")) {
                    cx.evaluateString(scope, "C8O.rhinoLoopBindings.rewrite=function(s){return {text:s,changes:[]};};", "baseline", 1, null);
                }
                cx.evaluateString(scope, Files.readString(root.resolve("tests/scripts/rhino_loop_bindings_cases.js")), "cases", 1, null);
                System.out.println("PASS optimization=" + optimization);
            }
        }
    }
}
