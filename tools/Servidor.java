import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.zip.GZIPOutputStream;

public final class Servidor {

    private static final String CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
            + "img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'";

    private record Options(int port, boolean network, Path file) {}

    private record Page(byte[] plain, byte[] gzip, String etag) {}

    private Servidor() {}

    public static void main(String[] args) throws IOException {
        Options options = parse(args);
        if (!Files.isRegularFile(options.file())) {
            System.err.println("Arquivo não encontrado: " + options.file() + ". Rode npm run build antes, ou passe --arquivo.");
            System.exit(1);
        }
        InetAddress bind = options.network() ? InetAddress.getByName("0.0.0.0") : InetAddress.getLoopbackAddress();
        HttpServer server = HttpServer.create(new InetSocketAddress(bind, options.port()), 64);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.createContext("/", exchange -> handle(exchange, options.file()));
        server.start();
        int port = server.getAddress().getPort();
        System.out.println("Pluma em http://localhost:" + port + "/");
        if (options.network()) {
            for (String address : lanAddresses()) System.out.println("Na rede local: http://" + address + ":" + port + "/");
        }
        System.out.println("Ctrl+C encerra.");
        Runtime.getRuntime().addShutdownHook(Thread.ofPlatform().unstarted(() -> {
            server.stop(1);
            System.out.println("Servidor encerrado.");
        }));
    }

    private static Options parse(String[] args) {
        int port = 8080;
        boolean network = false;
        Path file = Path.of("Pluma.html");
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--porta" -> port = Integer.parseInt(next(args, ++i, "--porta"));
                case "--rede" -> network = true;
                case "--arquivo" -> file = Path.of(next(args, ++i, "--arquivo"));
                case "--ajuda", "-h" -> {
                    System.out.println("""
                            uso: java tools/Servidor.java [--porta 8080] [--rede] [--arquivo Pluma.html]

                              --porta    porta HTTP (0 escolhe uma livre)
                              --rede     aceita conexões de outros aparelhos da rede local
                              --arquivo  página a servir (padrão: Pluma.html)""");
                    System.exit(0);
                }
                default -> {
                    System.err.println("Opção desconhecida: " + args[i] + " (use --ajuda)");
                    System.exit(2);
                }
            }
        }
        if (port < 0 || port > 65535) {
            System.err.println("Porta inválida: " + port);
            System.exit(2);
        }
        return new Options(port, network, file.toAbsolutePath().normalize());
    }

    private static String next(String[] args, int i, String name) {
        if (i >= args.length) {
            System.err.println("Falta o valor de " + name);
            System.exit(2);
        }
        return args[i];
    }

    private static List<String> lanAddresses() {
        List<String> out = new ArrayList<>();
        try {
            for (NetworkInterface nic : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nic.isUp() || nic.isLoopback() || nic.isVirtual()) continue;
                for (InetAddress a : Collections.list(nic.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) out.add(a.getHostAddress());
                }
            }
        } catch (SocketException e) {
            return out;
        }
        return out;
    }

    private static Page load(Path file) throws IOException {
        byte[] plain = Files.readAllBytes(file);
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(plain.length / 3);
        try (GZIPOutputStream gz = new GZIPOutputStream(buffer)) {
            gz.write(plain);
        }
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(plain);
            return new Page(plain, buffer.toByteArray(), "\"" + HexFormat.of().formatHex(hash, 0, 12) + "\"");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void handle(HttpExchange exchange, Path file) throws IOException {
        try (exchange) {
            var headers = exchange.getResponseHeaders();
            headers.set("X-Content-Type-Options", "nosniff");
            headers.set("Referrer-Policy", "no-referrer");
            headers.set("X-Frame-Options", "DENY");
            headers.set("Cross-Origin-Opener-Policy", "same-origin");
            headers.set("Cross-Origin-Resource-Policy", "same-origin");
            headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
            headers.set("Content-Security-Policy", CSP);
            headers.set("Date", DateTimeFormatter.RFC_1123_DATE_TIME.format(ZonedDateTime.now(ZoneOffset.UTC)));
            String method = exchange.getRequestMethod();
            String path = exchange.getRequestURI().getPath();
            if (!"GET".equals(method) && !"HEAD".equals(method)) {
                headers.set("Allow", "GET, HEAD");
                send(exchange, 405, "Método não permitido", "HEAD".equals(method));
                return;
            }
            if ("/saude".equals(path)) {
                headers.set("Content-Type", "application/json; charset=utf-8");
                headers.set("Cache-Control", "no-store");
                send(exchange, 200, "{\"status\":\"ok\"}", "HEAD".equals(method));
                return;
            }
            if (!"/".equals(path) && !"/index.html".equals(path) && !"/Pluma.html".equals(path)) {
                send(exchange, 404, "Não encontrado", "HEAD".equals(method));
                return;
            }
            Page page = load(file);
            headers.set("Content-Type", "text/html; charset=utf-8");
            headers.set("Cache-Control", "no-cache");
            headers.set("ETag", page.etag());
            headers.set("Vary", "Accept-Encoding");
            if (page.etag().equals(exchange.getRequestHeaders().getFirst("If-None-Match"))) {
                exchange.sendResponseHeaders(304, -1);
                return;
            }
            String accept = exchange.getRequestHeaders().getFirst("Accept-Encoding");
            boolean gzip = accept != null && accept.toLowerCase(Locale.ROOT).contains("gzip");
            byte[] body = gzip ? page.gzip() : page.plain();
            if (gzip) headers.set("Content-Encoding", "gzip");
            if ("HEAD".equals(method)) {
                headers.set("Content-Length", String.valueOf(body.length));
                exchange.sendResponseHeaders(200, -1);
                return;
            }
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
            log(exchange, 200);
        }
    }

    private static void send(HttpExchange exchange, int status, String text, boolean head) throws IOException {
        byte[] body = text.getBytes(StandardCharsets.UTF_8);
        if (!exchange.getResponseHeaders().containsKey("Content-Type")) {
            exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
        }
        if (head) {
            exchange.sendResponseHeaders(status, -1);
        } else {
            exchange.sendResponseHeaders(status, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        }
        log(exchange, status);
    }

    private static void log(HttpExchange exchange, int status) {
        System.out.printf(Locale.ROOT, "%s %s %d%n", exchange.getRequestMethod(), exchange.getRequestURI().getPath(), status);
    }
}
