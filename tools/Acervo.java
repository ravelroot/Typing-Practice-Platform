import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

public final class Acervo {

    private static final List<String> SIZES = List.of("short", "medium", "long");
    private static final List<String> COMPLEXITIES = List.of("easy", "medium", "hard");
    private static final List<String> WORD_LISTS = List.of("easy", "medium", "hard", "sounds");
    private static final Map<String, int[]> LIMITS = Map.of(
            "short", new int[] {25, 95},
            "medium", new int[] {100, 260},
            "long", new int[] {300, 560});
    private static final String LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
            + "áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ";
    private static final String TEXT_CHARS = LETTERS + "0123456789 .,;:!?-()\"'/%$@#&*+=><";
    private static final String WORD_CHARS = LETTERS + "-";
    private static final Pattern EASY_FORBIDDEN = Pattern.compile("[0-9\";:()!?]");
    private static final Pattern ID = Pattern.compile("[sml][emh]\\d{2}");
    private static final int MIN_PER_GROUP = 10;

    private record Phrase(String id, String size, String complexity, String text) {}

    private Acervo() {}

    public static void main(String[] args) throws IOException {
        if (args.length != 2) {
            System.err.println("uso: java tools/Acervo.java web/data/textos.json web/data/palavras.json");
            System.exit(2);
        }
        List<String> problems = new ArrayList<>();
        List<Phrase> phrases = readPhrases(Path.of(args[0]), problems);
        Map<String, List<String>> words = readWords(Path.of(args[1]), problems);
        checkPhrases(phrases, problems);
        checkWords(words, problems);
        report(phrases, words);
        if (!problems.isEmpty()) {
            System.err.println();
            System.err.println(problems.size() + (problems.size() == 1 ? " problema encontrado:" : " problemas encontrados:"));
            problems.forEach(p -> System.err.println("  - " + p));
            System.exit(1);
        }
        System.out.println();
        System.out.println("Acervo em ordem.");
    }

    private static List<Phrase> readPhrases(Path file, List<String> problems) throws IOException {
        Object root = Json.parse(Files.readString(file, StandardCharsets.UTF_8));
        List<Phrase> out = new ArrayList<>();
        if (!(root instanceof Map<?, ?> map) || !(map.get("phrases") instanceof List<?> list)) {
            problems.add(file + ": esperado um objeto com a lista \"phrases\"");
            return out;
        }
        for (Object item : list) {
            if (item instanceof Map<?, ?> p
                    && p.get("id") instanceof String id
                    && p.get("size") instanceof String size
                    && p.get("complexity") instanceof String complexity
                    && p.get("text") instanceof String text) {
                out.add(new Phrase(id, size, complexity, text));
            } else {
                problems.add(file + ": frase malformada: " + item);
            }
        }
        return out;
    }

    private static Map<String, List<String>> readWords(Path file, List<String> problems) throws IOException {
        Object root = Json.parse(Files.readString(file, StandardCharsets.UTF_8));
        Map<String, List<String>> out = new LinkedHashMap<>();
        if (!(root instanceof Map<?, ?> map)) {
            problems.add(file + ": esperado um objeto");
            return out;
        }
        for (String level : WORD_LISTS) {
            List<String> list = new ArrayList<>();
            if (map.get(level) instanceof List<?> raw) {
                for (Object w : raw) {
                    if (w instanceof String s) list.add(s);
                    else problems.add(file + ": palavra que não é texto em \"" + level + "\": " + w);
                }
            } else {
                problems.add(file + ": falta a lista \"" + level + "\"");
            }
            out.put(level, list);
        }
        return out;
    }

    private static void checkPhrases(List<Phrase> phrases, List<String> problems) {
        Set<String> ids = new HashSet<>();
        Set<String> texts = new HashSet<>();
        for (Phrase p : phrases) {
            String where = "frase " + p.id();
            if (!ID.matcher(p.id()).matches()) problems.add(where + ": id fora do padrão (ex.: se01)");
            if (!ids.add(p.id())) problems.add(where + ": id repetido");
            if (!texts.add(p.text())) problems.add(where + ": texto repetido");
            if (!SIZES.contains(p.size())) problems.add(where + ": tamanho inválido " + p.size());
            if (!COMPLEXITIES.contains(p.complexity())) problems.add(where + ": complexidade inválida " + p.complexity());
            if (!p.id().isEmpty() && SIZES.contains(p.size()) && p.id().charAt(0) != p.size().charAt(0)) {
                problems.add(where + ": o id não bate com o tamanho");
            }
            int length = p.text().codePointCount(0, p.text().length());
            int[] limit = LIMITS.get(p.size());
            if (limit != null && (length < limit[0] || length > limit[1])) {
                problems.add(where + ": " + length + " caracteres, fora de " + limit[0] + " a " + limit[1]);
            }
            if (!p.text().equals(p.text().strip())) problems.add(where + ": espaço no começo ou no fim");
            if (p.text().contains("  ")) problems.add(where + ": espaço duplo");
            p.text().codePoints()
                    .filter(c -> TEXT_CHARS.indexOf(c) < 0)
                    .distinct()
                    .forEach(c -> problems.add(where + ": caractere fora do teclado ABNT2: " + new String(Character.toChars(c))));
            if ("easy".equals(p.complexity()) && EASY_FORBIDDEN.matcher(p.text()).find()) {
                problems.add(where + ": frase fácil com número ou pontuação avançada");
            }
            if (!p.text().isEmpty() && !Character.isUpperCase(p.text().codePointAt(0)) && p.text().charAt(0) != '"') {
                problems.add(where + ": deve começar com letra maiúscula");
            }
        }
        for (String size : SIZES) {
            for (String complexity : COMPLEXITIES) {
                long n = phrases.stream().filter(p -> p.size().equals(size) && p.complexity().equals(complexity)).count();
                if (n < MIN_PER_GROUP) {
                    problems.add("grupo " + size + "/" + complexity + ": só " + n + " frases (mínimo " + MIN_PER_GROUP + ")");
                }
            }
        }
    }

    private static void checkWords(Map<String, List<String>> words, List<String> problems) {
        Map<String, String> seen = new HashMap<>();
        for (Map.Entry<String, List<String>> e : words.entrySet()) {
            int min = "sounds".equals(e.getKey()) ? 30 : 50;
            if (e.getValue().size() < min) problems.add("palavras " + e.getKey() + ": só " + e.getValue().size() + " (mínimo " + min + ")");
            for (String w : e.getValue()) {
                String before = seen.putIfAbsent(w, e.getKey());
                if (before != null) problems.add("palavra \"" + w + "\" repetida (" + before + " e " + e.getKey() + ")");
                if (w.isEmpty() || w.codePoints().anyMatch(c -> WORD_CHARS.indexOf(c) < 0)) {
                    problems.add("palavra \"" + w + "\" com caractere inválido");
                }
            }
        }
    }

    private static void report(List<Phrase> phrases, Map<String, List<String>> words) {
        System.out.println("Frases por tamanho e complexidade (quantidade · média de caracteres)");
        System.out.printf(Locale.ROOT, "%-8s %14s %14s %14s%n", "", "fácil", "média", "difícil");
        Map<String, String> sizeNames = Map.of("short", "curto", "medium", "médio", "long", "longo");
        for (String size : SIZES) {
            StringBuilder row = new StringBuilder(String.format(Locale.ROOT, "%-8s", sizeNames.get(size)));
            for (String complexity : COMPLEXITIES) {
                List<Phrase> group = phrases.stream().filter(p -> p.size().equals(size) && p.complexity().equals(complexity)).toList();
                double avg = group.stream().mapToInt(p -> p.text().codePointCount(0, p.text().length())).average().orElse(0);
                row.append(String.format(Locale.ROOT, " %14s", group.size() + " · " + Math.round(avg)));
            }
            System.out.println(row);
        }
        System.out.println();
        System.out.printf(Locale.ROOT, "Palavras: %d fáceis, %d médias e %d difíceis, mais %d onomatopeias (%d no total)%n",
                words.getOrDefault("easy", List.of()).size(),
                words.getOrDefault("medium", List.of()).size(),
                words.getOrDefault("hard", List.of()).size(),
                words.getOrDefault("sounds", List.of()).size(),
                words.values().stream().mapToInt(List::size).sum());
        System.out.printf(Locale.ROOT, "Frases: %d no total%n", phrases.size());
    }

    static final class Json {
        private final String s;
        private int i;

        private Json(String s) {
            this.s = s;
        }

        static Object parse(String text) {
            Json j = new Json(text);
            j.ws();
            Object v = j.value();
            j.ws();
            if (j.i != j.s.length()) throw j.error("conteúdo depois do fim");
            return v;
        }

        private IllegalArgumentException error(String msg) {
            return new IllegalArgumentException("JSON inválido na posição " + i + ": " + msg);
        }

        private void ws() {
            while (i < s.length() && " \t\r\n\uFEFF".indexOf(s.charAt(i)) >= 0) i++;
        }

        private Object value() {
            if (i >= s.length()) throw error("fim inesperado");
            char c = s.charAt(i);
            return switch (c) {
                case '{' -> object();
                case '[' -> array();
                case '"' -> string();
                case 't' -> literal("true", Boolean.TRUE);
                case 'f' -> literal("false", Boolean.FALSE);
                case 'n' -> literal("null", null);
                default -> number();
            };
        }

        private Object literal(String word, Object v) {
            if (!s.startsWith(word, i)) throw error("esperado " + word);
            i += word.length();
            return v;
        }

        private Map<String, Object> object() {
            Map<String, Object> m = new LinkedHashMap<>();
            i++;
            ws();
            if (s.charAt(i) == '}') {
                i++;
                return m;
            }
            while (true) {
                ws();
                if (s.charAt(i) != '"') throw error("esperada uma chave");
                String key = string();
                ws();
                if (s.charAt(i++) != ':') throw error("esperado ':'");
                ws();
                m.put(key, value());
                ws();
                char c = s.charAt(i++);
                if (c == '}') return m;
                if (c != ',') throw error("esperado ',' ou '}'");
            }
        }

        private List<Object> array() {
            List<Object> l = new ArrayList<>();
            i++;
            ws();
            if (s.charAt(i) == ']') {
                i++;
                return l;
            }
            while (true) {
                ws();
                l.add(value());
                ws();
                char c = s.charAt(i++);
                if (c == ']') return l;
                if (c != ',') throw error("esperado ',' ou ']'");
            }
        }

        private String string() {
            StringBuilder b = new StringBuilder();
            i++;
            while (true) {
                if (i >= s.length()) throw error("texto sem fim");
                char c = s.charAt(i++);
                if (c == '"') return b.toString();
                if (c != '\\') {
                    b.append(c);
                    continue;
                }
                char e = s.charAt(i++);
                switch (e) {
                    case '"', '\\', '/' -> b.append(e);
                    case 'b' -> b.append('\b');
                    case 'f' -> b.append('\f');
                    case 'n' -> b.append('\n');
                    case 'r' -> b.append('\r');
                    case 't' -> b.append('\t');
                    case 'u' -> {
                        b.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                        i += 4;
                    }
                    default -> throw error("escape inválido \\" + e);
                }
            }
        }

        private Number number() {
            int start = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            if (start == i) throw error("valor inesperado");
            String n = s.substring(start, i);
            return n.contains(".") || n.contains("e") || n.contains("E") ? Double.parseDouble(n) : Long.parseLong(n);
        }
    }
}
